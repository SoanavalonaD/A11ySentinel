"""Agent 1 — RootOrchestrator. Owns audit state, runs the stages in order.

Stage 1 is 2 -> 7: capture, rule audit, verify. No Gemini anywhere in this
path, which means it produces reproducible numbers and runs with no Vertex AI
quota. Agents 3, 4, 5 and 6 slot in later without changing this shape.

Deliberately written to run either standalone (JSON to stdout, for local
iteration) or against Firestore, so a broken GCP credential never blocks
development.
"""

from __future__ import annotations

import secrets
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone

from . import capture as capture_mod
from . import jurisdiction as jurisdiction_mod
from . import rule_auditor, verifier
from .models import Audit, AuditStatus, Finding, Trigger


def _now_iso() -> str:
    """ISO 8601 UTC with a Z suffix — contract invariant 6."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def new_audit_id() -> str:
    return f"aud_{secrets.token_hex(3)}"


@dataclass
class AuditResult:
    """Everything one audit produced. Serialises to the fixture shape."""

    audit: Audit
    findings: list[Finding] = field(default_factory=list)
    discards: list[str] = field(default_factory=list)

    def to_contract_json(self) -> dict:
        """Same shape as contracts/fixtures/audit-sample.json.

        Keeping these identical means the web layer's fixture-backed UI works
        against real output with no changes.
        """
        return {
            "audit": self.audit.to_firestore(),
            "findings": [f.to_firestore() for f in self.findings],
        }


async def run_audit(
    target_url: str,
    *,
    trigger: Trigger = Trigger.MANUAL,
    headless: bool = True,
    screenshot: bool = True,
    remediate: bool = False,
    remediation_limit: int | None = 12,
    model_triage: bool = False,
    visual: bool = False,
    on_status: Callable[[Audit], None] | None = None,
) -> AuditResult:
    """Single-page Stage 1 audit, end to end.

    Multi-page fan-out via Pub/Sub comes Sunday; the shape here does not
    change, the caller just runs this per page and sums the counts.
    """
    audit = Audit(
        auditId=new_audit_id(),
        targetUrl=target_url,
        trigger=trigger,
        status=AuditStatus.QUEUED,
        createdAt=_now_iso(),
    )
    result = AuditResult(audit=audit)

    def advance(status: AuditStatus) -> None:
        """Move to the next stage and let the caller persist it.

        The callback is optional so this module keeps no Firestore dependency
        and still runs locally with no credentials. A failure to record
        progress must never fail the audit — the work is worth more than the
        status line.
        """
        audit.status = status
        if on_status is None:
            return
        try:
            on_status(audit)
        except Exception as exc:  # noqa: BLE001
            result.discards.append(f"status write failed at {status.value}: {exc}")

    try:
        async with capture_mod.BrowserSession(headless=headless) as browser:
            advance(AuditStatus.CAPTURING)
            page_capture = await capture_mod.capture_page(
                browser, target_url, screenshot=screenshot
            )
            audit.pageCount = 1

            advance(AuditStatus.AUDITING)
            context = await browser.new_context(viewport=capture_mod.VIEWPORT)
            try:
                page = await context.new_page()
                # Audit the captured DOM, not a fresh fetch, so findings and
                # verification are anchored to the identical markup.
                await page.set_content(
                    page_capture.html, wait_until="domcontentloaded"
                )

                raw = await rule_auditor.run_axe(page)
                audit.violationsBefore = rule_auditor.count_violations(raw)

                # WCAG is what we measured. This only decides which regional
                # framework to name alongside it, as context.
                regional = jurisdiction_mod.detect(
                    page_capture.url,
                    lang=page_capture.language,
                    html=page_capture.html,
                )

                findings, discards = await rule_auditor.normalise(
                    page,
                    raw,
                    page_url=page_capture.url,
                    framework=page_capture.framework,
                    regional=regional,
                )
                result.discards = discards
                result.discards.append(f"jurisdiction: {regional.explain()}")

                # Agent 3. Runs on the same page object, so every selector
                # it returns is validated against the DOM the findings are
                # anchored to. Needs the screenshot — it cannot judge blind.
                if visual and page_capture.screenshot_png:
                    from . import visual_auditor

                    visual_result = await visual_auditor.audit(
                        page,
                        screenshot_png=page_capture.screenshot_png,
                        html=page_capture.html,
                        page_url=page_capture.url,
                        axe_findings=findings,
                        language=page_capture.language,
                        framework=page_capture.framework,
                        regional_framework=regional.framework,
                        start_index=len(findings) + 1,
                    )
                    findings.extend(visual_result.findings)
                    result.discards.extend(visual_result.discards)
                    # Screening and redaction outcomes belong in the
                    # report: "we checked" is a claim worth being able
                    # to show, and so is what was removed.
                    result.discards.extend(visual_result.security)
                    for note in visual_result.suspicious:
                        # Page text that tried to instruct the model.
                        # Reported, never obeyed, and never filed as a
                        # violation — it has no WCAG criterion.
                        result.discards.append(
                            f"SUSPICIOUS CONTENT in page: {note}"
                        )
                elif visual:
                    result.discards.append(
                        "visual audit skipped: no screenshot captured"
                    )
            finally:
                await context.close()

            # Agent 4. Falls back to the deterministic sort on any failure,
            # so a model outage reorders the report but never loses it.
            if model_triage and findings:
                from . import triage as triage_mod

                outcome = await triage_mod.triage(
                    findings, page_url=page_capture.url
                )
                findings = outcome.findings
                if outcome.reason:
                    result.discards.append(f"triage: {outcome.reason}")
            else:
                findings = rule_auditor.fallback_triage(findings)

            # Agents 5 and 6. Off by default so stage 1 stays model-free and
            # runs with no Vertex AI quota. Findings beyond the cap stay at
            # `detected` and are reported as such, not quietly dropped.
            if remediate and findings:
                advance(AuditStatus.REMEDIATING)
                from . import remediator

                report = await remediator.remediate_all(
                    findings,
                    limit=remediation_limit,
                    language=page_capture.language,
                )
                result.discards.extend(
                    f"{o.finding.findingId} ({o.finding.category}): {o.reason}"
                    for o in report.rejected
                    if o.reason
                )

            # Findings are real work already paid for. Attach them before
            # verification runs, so a failure there costs us the delta but not
            # the audit — an earlier version discarded 81 genuine findings
            # because one patch could not be applied.
            result.findings = findings

            # Agent 7. With no patches this reports before == after, which is
            # the honest stage 1 result rather than an invented delta.
            advance(AuditStatus.VERIFYING)
            try:
                verification = await verifier.verify_patches(
                    browser,
                    page_url=page_capture.url,
                    html=page_capture.html,
                    findings=findings,
                )
                audit.violationsAfter = verification.violations_after
                result.discards.extend(
                    f"{f.findingId} ({f.category}): {reason}"
                    for f, reason in verification.rejected
                    if f.patchedCode
                )
            except Exception as exc:  # noqa: BLE001
                # violationsAfter stays None, which the contract defines as
                # "pending" — never 0, which would read as "we fixed
                # everything". Findings are still reported.
                audit.error = f"verification failed: {type(exc).__name__}: {exc}"
                result.discards.append(f"verification: {exc}")

            # Anything still at `patched` failed verification. Drop the
            # patch so the finding is reported as the real violation it is,
            # rather than being refused at the write gate and disappearing.
            from .models import FindingStatus

            for finding in findings:
                if finding.status is FindingStatus.PATCHED:
                    finding.revert_to_detected()

        audit.completedAt = _now_iso()
        advance(AuditStatus.COMPLETE)

    except Exception as exc:
        audit.completedAt = _now_iso()
        audit.error = f"{type(exc).__name__}: {exc}"
        advance(AuditStatus.FAILED)

    return result
