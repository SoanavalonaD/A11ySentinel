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

from . import auditlog as auditlog_mod
from . import capture as capture_mod
from . import outreach as outreach_mod
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
    log: auditlog_mod.AuditLog | None = None
    # Agent 8's narrative, or a draft that says why there isn't one. Never
    # None — `drafted=False` is the instruction to use the static template.
    email_draft: outreach_mod.EmailDraft | None = None

    def note(
        self,
        agent: str,
        level: str,
        message: str,
        *,
        details: str | None = None,
        stage: str | None = None,
    ) -> None:
        """Record one decision in both forms at once.

        `discards` stays the human-readable trail a report quotes; `log` is the
        same event with the agent, level and stage kept separate so the UI can
        filter. Emitting both here means they cannot drift.
        """
        self.discards.append(message if details is None else f"{message} — {details}")
        if self.log is not None:
            self.log.record(agent, level, message, details=details, stage=stage)

    def to_contract_json(self) -> dict:
        """Same shape as contracts/fixtures/audit-sample.json.

        Keeping these identical means the web layer's fixture-backed UI works
        against real output with no changes.
        """
        return {
            "audit": self.audit.to_firestore(),
            "findings": [f.to_firestore() for f in self.findings],
            "auditLogs": self.log.to_contract() if self.log else [],
            "emailDraft": (
                self.email_draft.to_contract() if self.email_draft else None
            ),
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
    draft_email: bool = False,
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
    result = AuditResult(audit=audit, log=auditlog_mod.AuditLog(audit.auditId))
    # Captured inside the browser session so agent 8 can run after it closes.
    draft_inputs: tuple[str, str | None] | None = None

    def advance(status: AuditStatus) -> None:
        """Move to the next stage and let the caller persist it.

        The callback is optional so this module keeps no Firestore dependency
        and still runs locally with no credentials. A failure to record
        progress must never fail the audit — the work is worth more than the
        status line.
        """
        audit.status = status
        if result.log is not None:
            result.log.record(
                "RootOrchestrator", "info", f"Stage: {status.value}", stage=status.value
            )
        if on_status is None:
            return
        try:
            on_status(audit)
        except Exception as exc:  # noqa: BLE001
            result.note(
                "RootOrchestrator",
                "warn",
                f"Progress write failed at {status.value}",
                details=str(exc),
                stage=status.value,
            )

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
                for d in discards:
                    result.note("RuleAuditor", "warn", d, stage="auditing")
                result.note(
                    "RuleAuditor",
                    "success",
                    f"axe-core found {audit.violationsBefore} violations, "
                    f"{len(findings)} on targeted rules",
                    stage="auditing",
                )
                result.note(
                    "RootOrchestrator", "info", regional.explain(), stage="auditing"
                )

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
                    result.note(
                        "VisualAuditor",
                        "success" if visual_result.findings else "info",
                        f"{len(visual_result.findings)} findings a rule engine "
                        "cannot detect",
                        stage="auditing",
                    )
                    for d in visual_result.discards:
                        result.note("VisualAuditor", "warn", d, stage="auditing")
                    # Screening and redaction outcomes belong in the report:
                    # "we checked" is a claim worth being able to show, and
                    # so is what was removed.
                    for sec in visual_result.security:
                        loud = "FLAGGED" in sec or "redacted" in sec
                        result.note(
                            "VisualAuditor",
                            "warn" if loud else "info",
                            sec,
                            stage="auditing",
                        )
                    for note in visual_result.suspicious:
                        # Page text that tried to instruct the model.
                        # Reported, never obeyed, and never filed as a
                        # violation — it has no WCAG criterion.
                        result.note(
                            "VisualAuditor",
                            "error",
                            "Suspicious content in page - reported, not obeyed",
                            details=note,
                            stage="auditing",
                        )
                elif visual:
                    result.note(
                        "VisualAuditor",
                        "warn",
                        "Visual audit skipped: no screenshot captured",
                        stage="auditing",
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
                result.note(
                    "TriageAgent",
                    "success" if outcome.model_used else "warn",
                    f"{len(findings)} findings ordered by user impact"
                    + ("" if outcome.model_used else " (deterministic fallback)"),
                    details=outcome.reason,
                    stage="auditing",
                )
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
                result.note(
                    "RemediationFanOut",
                    "success" if report.drafted else "warn",
                    f"Patches drafted for {len(report.drafted)} findings, "
                    f"{len(report.rejected)} not attempted or refused",
                    stage="remediating",
                )
                for o in report.rejected:
                    if not o.reason:
                        continue
                    result.note(
                        "Remediator",
                        "warn",
                        f"{o.finding.findingId} ({o.finding.category}) - no patch",
                        details=o.reason,
                        stage="remediating",
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
                result.note(
                    "Verifier",
                    "success",
                    f"{verification.violations_before} to "
                    f"{verification.violations_after} violations, "
                    f"{len(verification.verified)} fixes verified",
                    details="Nothing unverified leaves this step.",
                    stage="verifying",
                )
                for f, reason in verification.rejected:
                    if not f.patchedCode:
                        continue
                    result.note(
                        "Verifier",
                        "error",
                        f"{f.findingId} ({f.category}) - patch refused",
                        details=reason,
                        stage="verifying",
                    )
            except Exception as exc:  # noqa: BLE001
                # violationsAfter stays None, which the contract defines as
                # "pending" — never 0, which would read as "we fixed
                # everything". Findings are still reported.
                audit.error = f"verification failed: {type(exc).__name__}: {exc}"
                result.note(
                    "Verifier",
                    "error",
                    "Verification failed; findings kept, delta not computed",
                    details=str(exc),
                    stage="verifying",
                )

            # Anything still at `patched` failed verification. Drop the
            # patch so the finding is reported as the real violation it is,
            # rather than being refused at the write gate and disappearing.
            from .models import FindingStatus

            for finding in findings:
                if finding.status is FindingStatus.PATCHED:
                    finding.revert_to_detected()

            draft_inputs = (page_capture.url, page_capture.language)

        # Agent 8. Runs last, on the settled result, so the narrative can only
        # describe findings that survived verification. A failure here costs
        # the prose and nothing else: the draft carries `drafted=False` and the
        # email still goes out on the static template.
        if draft_email and draft_inputs is not None:
            page_url, page_lang = draft_inputs
            result.email_draft = await outreach_mod.draft(
                result.findings, target_url=page_url, language=page_lang
            )
            drafted = result.email_draft
            if drafted.screened:
                result.note(
                    "OutreachDrafter",
                    "info",
                    "Screened the draft input before prompting",
                    details=drafted.screened,
                    stage="complete",
                )
            if drafted.drafted:
                result.note(
                    "OutreachDrafter",
                    "success",
                    f"Drafted email narrative citing "
                    f"{len(drafted.highlights)} finding(s)",
                    details=(
                        "Claim-discipline screen passed. Numbers, links and the "
                        "opt-out footer stay templated; nothing sends without a "
                        "human click."
                    ),
                    stage="complete",
                )
            else:
                result.note(
                    "OutreachDrafter",
                    "warn",
                    "No drafted narrative; the static template will be used",
                    details=drafted.reason,
                    stage="complete",
                )

        audit.completedAt = _now_iso()
        advance(AuditStatus.COMPLETE)

    except Exception as exc:
        audit.completedAt = _now_iso()
        audit.error = f"{type(exc).__name__}: {exc}"
        advance(AuditStatus.FAILED)

    return result
