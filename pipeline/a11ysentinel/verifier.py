"""Agent 7 — Verifier. Deterministic, no model involved.

Applies each drafted patch to the captured DOM, re-runs axe, and confirms two
things: the original violation is gone, and no new violation appeared.

Hard rule 3: nothing unverified reaches the proxy or the report. This module
is the only thing that may set `verified = True`.

The second check matters as much as the first. A patch that silences
`button-name` by adding `aria-label` to a `<div>` while introducing an
`aria-valid-attr-value` failure has not fixed anything; it has moved the
problem. Counting only the original rule would let that through.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from playwright.async_api import Browser

from . import rule_auditor
from .models import Finding, FindingStatus


@dataclass
class VerificationResult:
    """Outcome of verifying one patch set against one page."""

    violations_before: int
    violations_after: int
    verified: list[Finding] = field(default_factory=list)
    rejected: list[tuple[Finding, str]] = field(default_factory=list)

    @property
    def delta(self) -> int:
        return self.violations_before - self.violations_after


def _violation_keys(raw_violations: list[dict]) -> set[tuple[str, str]]:
    """Identity for a violation instance: (rule id, selector).

    Used to tell "the original violation is gone" from "the counts happen to
    match because we fixed one thing and broke another".
    """
    keys: set[tuple[str, str]] = set()
    for violation in raw_violations:
        rule_id = violation.get("id", "")
        for node in violation.get("nodes", []):
            target = node.get("target") or []
            keys.add((rule_id, target[-1] if target else ""))
    return keys


async def verify_patches(
    browser: Browser,
    *,
    page_url: str,
    html: str,
    findings: list[Finding],
) -> VerificationResult:
    """Apply every drafted patch to the DOM, re-run axe, and judge the result.

    Findings with no `patchedCode` are passed through unverified — there is
    nothing to check yet. That is the Stage 1 path: real counts, no patches,
    so before and after are equal and we say so honestly rather than
    manufacturing a delta.
    """
    context = await browser.new_context(viewport={"width": 1440, "height": 900})
    try:
        page = await context.new_page()
        # Load the captured HTML rather than re-fetching, so verification runs
        # against exactly the DOM the findings were anchored to.
        await page.set_content(html, wait_until="domcontentloaded")

        before_raw = await rule_auditor.run_axe(page)
        before_keys = _violation_keys(before_raw)
        violations_before = rule_auditor.count_violations(before_raw)

        drafted = [f for f in findings if f.patchedCode]
        if not drafted:
            return VerificationResult(
                violations_before=violations_before,
                violations_after=violations_before,
                verified=[],
                rejected=[(f, "no patch drafted yet") for f in findings],
            )

        applied: list[Finding] = []
        rejected: list[tuple[Finding, str]] = []

        for finding in drafted:
            ok = await page.evaluate(
                """([selector, replacement]) => {
                    const el = document.querySelector(selector);
                    if (!el) return false;
                    el.outerHTML = replacement;
                    return true;
                }""",
                [finding.selector, finding.patchedCode],
            )
            if ok:
                applied.append(finding)
            else:
                rejected.append((finding, "selector no longer matched at patch time"))

        after_raw = await rule_auditor.run_axe(page)
        after_keys = _violation_keys(after_raw)
        violations_after = rule_auditor.count_violations(after_raw)

        # Anything present after that was not present before is collateral
        # damage from our own patches.
        introduced = after_keys - before_keys

        for finding in applied:
            key = (finding.category, finding.selector)
            if key in after_keys:
                rejected.append((finding, "original violation still present after patch"))
                continue
            if introduced:
                rules = sorted({rule for rule, _ in introduced})
                rejected.append(
                    (finding, f"patch set introduced new violations: {', '.join(rules)}")
                )
                continue
            # Only here, and only after both checks passed.
            finding.mark_verified()

        verified = [f for f in applied if f.status is FindingStatus.VERIFIED]

        return VerificationResult(
            violations_before=violations_before,
            violations_after=violations_after,
            verified=verified,
            rejected=rejected,
        )
    finally:
        await context.close()
