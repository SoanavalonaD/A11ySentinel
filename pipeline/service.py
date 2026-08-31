"""Cloud Run service. Accepts an audit request, runs it, persists the result.

Endpoints:
    GET  /health           liveness, no dependencies touched
    GET  /healthz          same; intercepted by Google Frontend on .run.app
    GET  /readyz           readiness: axe vendored, Chromium launchable
    POST /audit            run an audit synchronously
    POST /pubsub           Pub/Sub push subscription entrypoint

CORS is restricted to the dashboard origins in ALLOWED_ORIGINS; a browser on
any other origin is refused at the preflight.

Kept synchronous for now. Multi-page fan-out moves the work to a Cloud Run Job
behind Pub/Sub; the audit logic does not change, only who calls it.
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
import os
import re
from pathlib import Path
from typing import Any
import httpx

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, field_validator

from a11ysentinel import capture as capture_mod
from a11ysentinel import prospector, scout, store
from a11ysentinel.models import Trigger
from a11ysentinel.orchestrator import run_audit
from a11ysentinel.rule_auditor import AXE_PATH
from a11ysentinel.verifier import _APPLIED_OK, _APPLY_JS

app = FastAPI(
    title="A11ySentinel pipeline",
    description=(
        "Finds accessibility violations, prioritises them by user impact, "
        "drafts fixes, and verifies them. A human approves every change. "
        "This service does not make a site compliant."
    ),
    version="0.1.0",
)

# The dashboard is a browser app on a different origin, so without this the
# preflight OPTIONS gets a 405 with no Access-Control-Allow-Origin and every
# audit request dies before it reaches the service. The dashboard could not
# tell that apart from a network outage, which is how it ended up answering
# with fabricated results instead.
#
# Explicit origins rather than "*": this endpoint launches a browser against a
# URL the caller chooses, so it should not be callable from any page a person
# happens to be visiting. Add deployed dashboard origins via ALLOWED_ORIGINS,
# comma-separated.
_DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
]
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", ",".join(_DEFAULT_ORIGINS)).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

PERSIST = os.getenv("PERSIST_TO_FIRESTORE", "true").lower() == "true"

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("a11ysentinel")

# The demo target, served from our own service.
#
# Outreach guard 3 requires the video to run against a domain we control.
# Hosting the fixture site here rather than on separate infrastructure
# means the demo has no extra moving part to fail on Monday morning, and
# the prospect pool can point at a real https URL that is unambiguously
# ours. The site is a fictional grocer; no real business is depicted.
_DEMO_DIR = Path(__file__).parent / "demo-site"
if _DEMO_DIR.is_dir():
    app.mount(
        "/demo", StaticFiles(directory=str(_DEMO_DIR), html=True), name="demo"
    )


class AuditRequest(BaseModel):
    # Reject unknown fields instead of ignoring them. Pydantic's default is
    # to drop them silently, which meant a request to a stale revision
    # asking for a feature it did not have looked identical to one where
    # the feature ran and found nothing. A 422 says which it was.
    model_config = ConfigDict(extra="forbid")

    url: str
    trigger: Trigger = Trigger.MANUAL
    # Stage 2. Off by default: it costs Vertex AI quota, and stage 1 is
    # useful on its own.
    remediate: bool = False
    remediationLimit: int = 12
    modelTriage: bool = False
    visual: bool = False
    # Agent 8. Off by default: it costs quota, and an audit is useful without
    # an email. The draft it returns is a proposal — the human approval gate
    # in the dashboard is still the only thing that can send anything.
    draftEmail: bool = False

    @field_validator("url")
    @classmethod
    def _must_be_http(cls, value: str) -> str:
        if not value.startswith(("http://", "https://")):
            raise ValueError("url must include an http:// or https:// scheme")
        return value


@app.get("/health")
@app.get("/healthz")
async def health() -> dict[str, str]:
    """Liveness. Touches no dependencies.

    Served on both paths because Google Frontend intercepts `/healthz` on
    `.run.app` domains and answers it with its own 404 before the request
    reaches the container — confirmed by the absence of an
    `x-cloud-trace-context` header on that path while every other route,
    including unknown ones, carries it. `/health` is the one to use against a
    deployed service; `/healthz` still works locally and behind a proxy.
    """
    return {"status": "ok"}


@app.get("/readyz")
async def readyz() -> dict[str, Any]:
    """Readiness means the rule engine can actually run.

    A container that starts but cannot launch Chromium or find axe would
    accept traffic and fail every audit, which is worse than not starting.
    """
    checks: dict[str, Any] = {"axe_vendored": AXE_PATH.exists()}

    try:
        from playwright.async_api import async_playwright

        pw = await async_playwright().start()
        browser = await pw.chromium.launch(
            args=["--disable-dev-shm-usage", "--no-sandbox"]
        )
        await browser.close()
        await pw.stop()
        checks["chromium_launchable"] = True
    except Exception as exc:  # noqa: BLE001
        checks["chromium_launchable"] = False
        checks["chromium_error"] = f"{type(exc).__name__}: {exc}"

    ready = all(v is True for k, v in checks.items() if not k.endswith("_error"))
    if not ready:
        raise HTTPException(status_code=503, detail=checks)
    return {"status": "ready", **checks}


async def _run_and_persist(
    url: str,
    trigger: Trigger,
    *,
    remediate: bool = False,
    limit: int = 12,
    triage: bool = False,
    visual: bool = False,
    draft_email: bool = False,
    scout_note: str | None = None,
) -> dict[str, Any]:
    # Write each stage transition as it happens, so a dashboard polling the
    # audit document sees live progress. The audit spends most of its time in
    # `remediating` and `verifying`; without this it would appear stuck on
    # `auditing` for a minute and then jump straight to `complete`.
    #
    # Best-effort by design: run_audit swallows a failure here and records it,
    # because losing the status line is not worth losing the audit.
    def record_progress(audit) -> None:
        if not PERSIST:
            return
        client = getattr(record_progress, "_client", None)
        if client is None:
            client = store.get_client()
            record_progress._client = client
        store.write_audit(client, audit)

    result = await run_audit(
        url,
        trigger=trigger,
        remediate=remediate,
        remediation_limit=limit or None,
        model_triage=triage,
        visual=visual,
        draft_email=draft_email,
        scout_note=scout_note,
        on_status=record_progress,
    )
    # Item 3: Set proxyUrl on audit model BEFORE to_contract_json and store.persist()
    result.audit.proxyUrl = f"/proxy/{result.audit.auditId}"
    payload = result.to_contract_json()

    # Every reason a candidate was dropped, returned and logged.
    # The modules collect these precisely so they are not silence, and
    # throwing them away at the API boundary undid that: a visual audit
    # that failed in production looked identical to one that found
    # nothing.
    # Two forms of the same trail: `notes` stays human-readable for the
    # report, `auditLogs` carries agent, level and stage separately so the
    # dashboard can filter. to_contract_json already emits auditLogs.
    payload["notes"] = result.discards
    # `emailDraft.drafted == false` is a normal outcome, not an error: it tells
    # the web layer to use the static template. Either way the approval gate
    # is unchanged.
    if result.email_draft is not None:
        payload["emailDraft"] = result.email_draft.to_contract()
    for entry in (result.log.entries if result.log else []):
        log.info(
            "audit %s [%s] %s: %s",
            result.audit.auditId, entry.level, entry.agentName, entry.message,
        )

    if PERSIST:
        try:
            report = store.persist(result.audit, result.findings)
            payload["write"] = {
                "findingsWritten": report.findings_written,
                # Surfaced, not swallowed. If we are discarding our own output
                # we need to see it.
                "findingsRejected": [
                    {"findingId": fid, "reason": reason}
                    for fid, reason in report.findings_rejected
                ],
            }
        except Exception as exc:  # noqa: BLE001
            # An audit that ran but could not be stored is still worth
            # returning. Report the failure rather than losing the result.
            payload["write"] = {"error": f"{type(exc).__name__}: {exc}"}

    payload["disclaimer"] = (
        "A11ySentinel finds, prioritises, drafts and verifies accessibility "
        "issues. It does not make a site compliant. A human approves every change."
    )
    return payload


@app.post("/audit")
async def audit(request: AuditRequest) -> dict[str, Any]:
    return await _run_and_persist(
        request.url,
        request.trigger,
        remediate=request.remediate,
        limit=request.remediationLimit,
        triage=request.modelTriage,
        visual=request.visual,
        draft_email=request.draftEmail,
    )


@app.post("/pubsub")
async def pubsub(request: Request) -> dict[str, Any]:
    """Pub/Sub push endpoint.

    Message data is base64 JSON: {"url": "...", "trigger": "manual"}.
    Malformed messages are acknowledged with 204 rather than retried — Pub/Sub
    would otherwise redeliver an unparseable message until it expires.
    """
    envelope = await request.json()
    message = (envelope or {}).get("message") or {}
    raw = message.get("data")
    if not raw:
        raise HTTPException(status_code=204, detail="no data in message")

    try:
        decoded = json.loads(base64.b64decode(raw).decode("utf-8"))
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(status_code=204, detail=f"unparseable message: {exc}") from exc

    url = decoded.get("url")
    if not url or not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=204, detail="missing or invalid url")

    trigger = Trigger(decoded.get("trigger", "manual"))
    return await _run_and_persist(
        url,
        trigger,
        remediate=bool(decoded.get("remediate", False)),
        limit=int(decoded.get("remediationLimit", 12)),
        triage=bool(decoded.get("modelTriage", False)),
        visual=bool(decoded.get("visual", False)),
    )


class ProspectRequest(BaseModel):
    """Nothing here names a target. That is the point."""

    model_config = ConfigDict(extra="forbid")

    remediate: bool = True
    remediationLimit: int = 12
    modelTriage: bool = True
    visual: bool = True
    # On by default here, unlike /audit. Prospecting exists to produce
    # outreach: the run picks a target nobody asked us to audit, so an email
    # is the deliverable rather than an extra. It is still only a draft, and
    # the approval gate in the dashboard is still the only thing that sends.
    draftEmail: bool = True


@app.post("/prospect")
async def prospect(request: ProspectRequest) -> dict[str, Any]:
    """Autonomous run: the agent chooses its own target, then audits it.

    No URL is supplied by anyone. The candidate pool comes from configuration
    (PROSPECT_POOL), the choice is the agent's, and the reasoning is returned
    alongside the audit so the decision can be shown rather than asserted.
    """
    async with capture_mod.BrowserSession() as browser:
        selection = await prospector.pick_target(browser)

    if not selection.chosen:
        return {
            "selection": {
                "chosen": None,
                "reason": selection.reason,
                "considered": [
                    {"url": c.url, "violations": c.violations, "skipped": c.skipped}
                    for c in selection.considered
                ],
            },
            "audit": None,
        }

    payload = await _run_and_persist(
        selection.chosen,
        Trigger.PROSPECT,
        remediate=request.remediate,
        limit=request.remediationLimit,
        triage=request.modelTriage,
        visual=request.visual,
        draft_email=request.draftEmail,
        # The decision agent 0 actually made, carried into the audit's own
        # trail so the choice can be read next to its consequences.
        scout_note=selection.reason,
    )
    payload["selection"] = {
        "chosen": selection.chosen,
        "reason": selection.reason,
        "considered": [
            {"url": c.url, "violations": c.violations, "skipped": c.skipped}
            for c in selection.considered
        ],
    }
    return payload


@app.get("/prospect/scout")
async def prospect_scout(
    region: str | None = None,
    sectors: str | None = None,
    count: int = 8,
) -> StreamingResponse:
    """Agent 0, streamed. Candidates arrive as they are found and checked.

    Server-sent events rather than one JSON response because the two halves
    have very different latencies: the grounded search takes around twenty
    seconds and returns everything at once, then each candidate needs its own
    page load and axe run. Batching all of that into a single response means
    the dashboard shows a spinner for a minute and then a list. Streaming lets
    the list appear the moment the search returns and fill in its numbers one
    at a time, which is also the honest picture of what the agent is doing.

    Three event types:

      search     the queries the model actually ran
      candidate  one proposed site, before it has been checked
      scanned    the same site, with a violation count or the reason it was
                 skipped — a proposal that fails here never becomes a target

    Errors arrive as an `error` event rather than an HTTP status, because by
    the time one happens the response has already begun.
    """

    async def events():
        def sse(event: str, payload: dict) -> str:
            return f"event: {event}\ndata: {json.dumps(payload)}\n\n"

        try:
            result = await scout.discover(
                region=region, sectors=sectors, count=count
            )
        except Exception as exc:  # noqa: BLE001
            yield sse("error", {"reason": f"{type(exc).__name__}: {exc}"})
            return

        yield sse(
            "search",
            {
                "queries": result.queries,
                "modelUsed": result.model_used,
                "reason": result.reason,
                "discards": result.discards,
            },
        )

        if not result.prospects:
            yield sse("done", {"found": 0, "scanned": 0})
            return

        # Everything the scout proposed, immediately. The operator sees the
        # shortlist while the checking is still happening.
        for p in result.prospects:
            yield sse("candidate", p.to_contract())

        scanned = 0
        try:
            async with capture_mod.BrowserSession() as browser:
                for p in result.prospects:
                    candidate = await prospector.scan_candidate(browser, p.url)
                    scanned += 1
                    yield sse(
                        "scanned",
                        {
                            "url": p.url,
                            "violations": candidate.violations,
                            "skipped": candidate.skipped,
                        },
                    )
        except Exception as exc:  # noqa: BLE001
            # A browser failure costs the counts, not the shortlist: the
            # candidates already emitted stay on screen as proposals.
            yield sse("error", {"reason": f"scanning stopped: {type(exc).__name__}: {exc}"})

        yield sse("done", {"found": len(result.prospects), "scanned": scanned})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# Tag a patched element. Kept separate from verifier._APPLY_JS so the
# verification path stays exactly as it was — the verifier must not start
# writing attributes into the DOM it is measuring.
_MARK_JS = """([selector]) => {
    let el;
    try { el = document.querySelector(selector); } catch (e) { return false; }
    if (!el || !el.setAttribute) return false;
    el.setAttribute("data-a11ysentinel-patched", "1");
    return true;
}"""

# The outline, injected as a <style> the target page cannot lose. `!important`
# because we are decorating someone else's stylesheet and theirs may be more
# specific than anything we can write.
#
# outline rather than border: a border changes layout, and the point of this
# preview is that the fixes do not.
_HIGHLIGHT_CSS_JS = """() => {
    const css = `
      [data-a11ysentinel-patched] {
        outline: 3px solid #10b981 !important;
        outline-offset: 2px !important;
        background-color: rgba(16, 185, 129, 0.10) !important;
      }
      [data-a11ysentinel-patched]:hover {
        outline-color: #059669 !important;
      }
    `;
    const style = document.createElement("style");
    style.setAttribute("data-a11ysentinel", "highlight");
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
    return true;
}"""


def _strip_scripts_and_events(raw_html: str) -> str:
    """Security defense: strip <script> tags, inline on* handlers, and javascript: links."""
    if not raw_html:
        return ""
    # Strip <script>...</script>
    cleaned = re.sub(r"<script\b[^>]*>.*?</script>", "", raw_html, flags=re.DOTALL | re.IGNORECASE)
    # Strip inline event attributes like onclick="...", onload='...'
    cleaned = re.sub(r"\son[a-z]+\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)", "", cleaned, flags=re.IGNORECASE)
    # Strip javascript: URIs
    cleaned = re.sub(r'(href|src)\s*=\s*["\']javascript:[^"\']*["\']', r'\1="#"', cleaned, flags=re.IGNORECASE)
    return cleaned


@app.get("/proxy/{audit_id}", response_class=HTMLResponse)
async def proxy_preview(
    audit_id: str, request: Request, highlight: int = 1
) -> HTMLResponse:
    """Live proxy preview using Playwright _APPLY_JS.

    Reads audit from Firestore, applies verified patches using real document.querySelector
    in Playwright context, and returns modified HTML with preview banner.
    """
    target_url: str | None = None
    verified_patches: list[tuple[str, str]] = []
    found_audit = False

    # 1. Read audit & findings from Firestore if available
    if PERSIST:
        try:
            client = store.get_client()
            audit_ref = client.collection("audits").document(audit_id).get()
            if audit_ref.exists:
                found_audit = True
                audit_data = audit_ref.to_dict() or {}
                target_url = audit_data.get("targetUrl")

                findings_stream = (
                    client.collection("audits")
                    .document(audit_id)
                    .collection("findings")
                    .stream()
                )
                for doc in findings_stream:
                    fdata = doc.to_dict() or {}
                    if (
                        fdata.get("status") == "verified"
                        and fdata.get("patchedCode")
                        and fdata.get("selector")
                    ):
                        verified_patches.append(
                            (fdata.get("selector"), fdata.get("patchedCode"))
                        )
        except Exception as exc:  # noqa: BLE001
            log.warning("Proxy could not fetch audit %s from Firestore: %s", audit_id, exc)

    # 2. Sample fixture fallbacks for demo audit IDs
    if not found_audit:
        if "7f3c91" in audit_id:
            found_audit = True
            target_url = "https://demo-target.a11ysentinel.dev/contact"
            verified_patches = [
                (
                    "form#contact > button.btn-primary",
                    '<button class="btn-primary" type="submit" aria-label="Send message"><i class="icon-send" aria-hidden="true"></i></button>',
                )
            ]
        elif "antsahabe" in audit_id:
            found_audit = True
            target_url = "https://a11ysentinel-pipeline-708226575684.us-central1.run.app/demo/index.html"
            verified_patches = [
                (
                    "form#contact > button.btn-primary",
                    '<button class="btn-primary" type="submit" aria-label="Send message"><i class="icon-send" aria-hidden="true"></i></button>',
                )
            ]

    # Review Item 2: Return 404 for unknown audit IDs
    if not found_audit or not target_url:
        raise HTTPException(status_code=404, detail=f"No audit found for id {audit_id}")

    # 3. Fetch raw target HTML using httpx
    raw_html = ""
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(
                target_url, headers={"User-Agent": "A11ySentinel-Proxy/1.0"}
            )
            if resp.status_code == 200:
                raw_html = resp.text
    except Exception as exc:  # noqa: BLE001
        log.warning("Proxy target fetch failed for %s: %s", target_url, exc)

    if not raw_html:
        raise HTTPException(
            status_code=502, detail=f"Could not fetch target page at {target_url}"
        )

    # Review Item 5: Security Defense - Strip scripts and inline handlers
    cleaned_html = _strip_scripts_and_events(raw_html)

    # Inject <base href="..."> into <head> to preserve site CSS, fonts, and relative assets
    base_tag = f'<base href="{target_url}">'
    if "<head>" in cleaned_html:
        cleaned_html = cleaned_html.replace("<head>", f"<head>\n  {base_tag}", 1)
    elif "<head " in cleaned_html:
        head_idx = cleaned_html.find("<head ")
        close_idx = cleaned_html.find(">", head_idx)
        if close_idx != -1:
            cleaned_html = cleaned_html[: close_idx + 1] + f"\n  {base_tag}" + cleaned_html[close_idx + 1 :]
    else:
        cleaned_html = f"<head>{base_tag}</head>\n" + cleaned_html

    # Review Item 1: Apply patches with Playwright _APPLY_JS in browser context
    applied_count = 0
    patched_html = cleaned_html

    try:
        async with capture_mod.BrowserSession() as browser:
            context = await browser.new_context(viewport=capture_mod.VIEWPORT)
            page = await context.new_page()
            await page.set_content(cleaned_html, wait_until="domcontentloaded")

            marks: list[str] = []
            for selector, patched_code in verified_patches:
                outcome = await page.evaluate(_APPLY_JS, [selector, patched_code])
                if outcome not in _APPLIED_OK:
                    log.info("proxy %s: %s -> %s", audit_id, selector, outcome)
                    continue

                applied_count += 1
                # `attributes` means _APPLY_JS patched <html>, <head> or <body>
                # in place. Outlining the whole document is noise, so those
                # count but are not marked.
                if outcome != "attributes":
                    marks.append(selector)

            # Marked after every patch has landed, not as each one lands.
            # Patches can nest: replacing an <a> also replaces an <img> inside
            # it, and an outerHTML swap takes any marker on the old subtree
            # with it. Marking during the loop lost one highlight per nested
            # pair while the patch itself applied fine — a highlight that
            # undercounts is worse than none, because it reads as "this change
            # did not happen".
            if highlight:
                for selector in marks:
                    await page.evaluate(_MARK_JS, [selector])
                await page.evaluate(_HIGHLIGHT_CSS_JS)

            patched_html = await page.content()
            await context.close()
    except Exception as exc:  # noqa: BLE001
        log.error("Proxy Playwright execution error for %s: %s", audit_id, exc)

    # Re-apply script stripping to result of page.content()
    patched_html = _strip_scripts_and_events(patched_html)

    # 5. Inject Preview Banner into <body>
    #
    # An absolute URL, because <base href> above now points at the audited
    # site: a root-relative "/" would send the reader to *their* homepage
    # rather than back to the dashboard.
    #
    # The scheme comes from X-Forwarded-Proto, not from request.base_url.
    # Cloud Run terminates TLS at its frontend and forwards to the container
    # over plain HTTP, so base_url reports http:// and the banner on an
    # https:// page linked back insecurely. The proxy header is the only place
    # the original scheme survives.
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    dashboard_url = f"{proto}://{request.url.netloc}/"
    highlight_note = (
        '<span style="color: #94a3b8;">• patched elements outlined in green</span>'
        if highlight and applied_count
        else ""
    )

    banner_html = f"""
    <div id="a11ysentinel-proxy-banner" style="
      position: sticky; top: 0; left: 0; right: 0; z-index: 999999;
      background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      padding: 10px 16px; border-bottom: 2px solid #10b981;
      display: flex; align-items: center; justify-content: space-between; font-size: 13px;
    ">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="background: #10b981; color: #064e3b; font-weight: 800; font-size: 10px; padding: 2px 6px; border-radius: 4px;">LIVE PROXY PREVIEW</span>
        <span style="font-weight: 600;">A11ySentinel Corrected Preview</span>
        <span style="color: #34d399;">• {applied_count} of {len(verified_patches)} verified patch(es) applied live</span>
        {highlight_note}
      </div>
      <a href="{dashboard_url}" style="background: #334155; color: white; text-decoration: none; padding: 5px 12px; border-radius: 6px; font-weight: 600; font-size: 11px;">&larr; Back to Dashboard</a>
    </div>
    """

    if "<body>" in patched_html:
        patched_html = patched_html.replace("<body>", f"<body>\n{banner_html}", 1)
    elif "<body" in patched_html:
        body_idx = patched_html.find("<body")
        close_idx = patched_html.find(">", body_idx)
        if close_idx != -1:
            patched_html = (
                patched_html[: close_idx + 1]
                + f"\n{banner_html}"
                + patched_html[close_idx + 1 :]
            )
        else:
            patched_html = banner_html + patched_html
    else:
        patched_html = banner_html + patched_html

    return HTMLResponse(content=patched_html, status_code=200)



# The built dashboard, served from this same service.
#
# Same origin as the API, which is the point: the browser makes relative
# requests to /audit, so there is no cross-origin request and CORS cannot
# block it. The dashboard previously ran on its own origin, the service had
# no CORS headers, and every audit died at the preflight — invisibly, because
# the browser will not say why.
#
# Registered at the very bottom of this module because a mount at "/" matches
# every path; anything declared after it would never be reached. Built by
# deploy.sh into web-dist/ before the image is built, so it is absent in a
# plain local run and the API still serves normally.
def _mount_dashboard() -> None:
    dist = Path(__file__).parent / "web-dist"
    if not (dist / "index.html").is_file():
        log.info("no web-dist/ present; serving the API only")
        return
    app.mount("/", StaticFiles(directory=str(dist), html=True), name="dashboard")
    log.info("dashboard mounted at /")


_mount_dashboard()
