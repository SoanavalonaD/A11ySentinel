"""Cloud Run service. Accepts an audit request, runs it, persists the result.

Endpoints:
    GET  /health           liveness, no dependencies touched
    GET  /healthz          same; intercepted by Google Frontend on .run.app
    GET  /readyz           readiness: axe vendored, Chromium launchable
    POST /audit            run an audit synchronously
    POST /pubsub           Pub/Sub push subscription entrypoint

Kept synchronous for now. Multi-page fan-out moves the work to a Cloud Run Job
behind Pub/Sub; the audit logic does not change, only who calls it.
"""

from __future__ import annotations

import base64
import binascii
import json
import os
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, field_validator

from a11ysentinel import store
from a11ysentinel.models import Trigger
from a11ysentinel.orchestrator import run_audit
from a11ysentinel.rule_auditor import AXE_PATH

app = FastAPI(
    title="A11ySentinel pipeline",
    description=(
        "Finds accessibility violations, prioritises them by user impact, "
        "drafts fixes, and verifies them. A human approves every change. "
        "This service does not make a site compliant."
    ),
    version="0.1.0",
)

PERSIST = os.getenv("PERSIST_TO_FIRESTORE", "true").lower() == "true"


class AuditRequest(BaseModel):
    url: str
    trigger: Trigger = Trigger.MANUAL

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


async def _run_and_persist(url: str, trigger: Trigger) -> dict[str, Any]:
    result = await run_audit(url, trigger=trigger)
    payload = result.to_contract_json()

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
    return await _run_and_persist(request.url, request.trigger)


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
    return await _run_and_persist(url, trigger)
