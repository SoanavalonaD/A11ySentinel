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

from . import announce, rule_auditor
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

        # Read what each element announces before anything is touched. This is
        # the only moment the original accessibility tree exists, so it has to
        # happen before the first patch is applied.
        for finding in drafted:
            heard = await announce.announcement_for(context, page, finding.selector)
            if heard is not None:
                finding.announcedBefore = heard.render()

        for finding in drafted:
            # Applying a patch must never be able to fail the audit. A single
            # unpatchable element previously threw out of page.evaluate and
            # discarded an entire 81-violation run, so every failure mode is
            # caught in the page and returned as a string.
            outcome = await page.evaluate(
                """([selector, replacement]) => {
                    let el;
                    try {
                        el = document.querySelector(selector);
                    } catch (e) {
                        return "bad-selector: " + e.message;
                    }
                    if (!el) return "no-match";

                    // <html>, <head> and <body> cannot be replaced via
                    // outerHTML — their parent is the Document, which throws
                    // NoModificationAllowedError. html-has-lang targets <html>
                    // exactly, so this is a common case, not an edge one.
                    // Copy the patched attributes across instead.
                    const isRoot = el === document.documentElement
                        || el === document.head
                        || el === document.body;

                    try {
                        if (isRoot) {
                            const parsed = new DOMParser().parseFromString(
                                replacement, "text/html"
                            );
                            const source = parsed.querySelector(el.tagName)
                                || parsed.documentElement;
                            if (!source || !source.attributes) return "unparseable";
                            for (const attr of Array.from(source.attributes)) {
                                el.setAttribute(attr.name, attr.value);
                            }
                            return "attributes";
                        }
                        el.outerHTML = replacement;
                        return "replaced";
                    } catch (e) {
                        return "apply-failed: " + e.message;
                    }
                }""",
                [finding.selector, finding.patchedCode],
            )
            if outcome in ("replaced", "attributes"):
                applied.append(finding)
            elif outcome == "no-match":
                rejected.append((finding, "selector no longer matched at patch time"))
            else:
                rejected.append((finding, f"patch could not be applied: {outcome}"))

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

            # Read the same element again from the patched tree. Chromium
            # computes this name the same way it would for a real screen
            # reader, so this is what the element now announces — measured,
            # not predicted.
            heard = await announce.announcement_for(context, page, finding.selector)
            if heard is not None:
                finding.announcedAfter = heard.render()

        verified = [f for f in applied if f.status is FindingStatus.VERIFIED]

        return VerificationResult(
            violations_before=violations_before,
            violations_after=violations_after,
            verified=verified,
            rejected=rejected,
        )
    finally:
        await context.close()
