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
from dataclasses import dataclass, field
from datetime import datetime, timezone

from . import capture as capture_mod
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

    try:
        async with capture_mod.BrowserSession(headless=headless) as browser:
            audit.status = AuditStatus.CAPTURING
            page_capture = await capture_mod.capture_page(
                browser, target_url, screenshot=screenshot
            )
            audit.pageCount = 1

            audit.status = AuditStatus.AUDITING
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

                findings, discards = await rule_auditor.normalise(
                    page,
                    raw,
                    page_url=page_capture.url,
                    framework=page_capture.framework,
                )
                result.discards = discards
            finally:
                await context.close()

            findings = rule_auditor.fallback_triage(findings)

            # Agent 7. With no Remediator yet there are no patches, so
            # violationsAfter equals violationsBefore. We report that plainly
            # rather than inventing a delta.
            verification = await verifier.verify_patches(
                browser,
                page_url=page_capture.url,
                html=page_capture.html,
                findings=findings,
            )
            audit.violationsAfter = verification.violations_after
            result.findings = findings

        audit.status = AuditStatus.COMPLETE
        audit.completedAt = _now_iso()

    except Exception as exc:
        audit.status = AuditStatus.FAILED
        audit.completedAt = _now_iso()
        audit.error = f"{type(exc).__name__}: {exc}"

    return result
