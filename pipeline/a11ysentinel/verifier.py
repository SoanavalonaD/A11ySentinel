"""Agent 7 — Verifier. Deterministic, no model involved.

Applies each drafted patch, re-runs axe, and confirms two things: the original
violation is gone, and the patch introduced nothing new.

Hard rule 3: nothing unverified reaches the proxy or the report. This module is
the only thing that may set `verified = True`.

The second check matters as much as the first. A patch that silences
`button-name` by adding `aria-label` to a `<div>` while introducing an
`aria-valid-attr-value` failure has not fixed anything; it has moved the
problem.

**Patches are judged one at a time.** An earlier version applied the whole set,
re-ran axe once, and rejected everything if anything new appeared — collective
punishment. On a live run that cost seventeen good fixes because one patch, a
correct fix for `COLOUR_ONLY_MEANING`, added a text badge whose colour then
failed contrast. The conservative direction was right; the granularity was not.

So each candidate is evaluated against a DOM rebuilt from the original with
only the already-accepted patches applied. Rebuilding rather than reverting
avoids needing a stable handle on an element whose markup we just replaced,
and it costs one axe run per candidate — a few seconds for a realistic patch
set, in exchange for knowing *which* patch broke something.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from playwright.async_api import Browser, Page

from . import announce, rule_auditor
from .models import Finding, FindingStatus

# Applying a patch must never be able to fail the audit. Every failure mode
# inside the page is caught and returned as a string rather than thrown — an
# earlier version let NoModificationAllowedError escape and discarded an
# entire 81-violation run.
_APPLY_JS = """([selector, replacement]) => {
    let el;
    try {
        el = document.querySelector(selector);
    } catch (e) {
        return "bad-selector: " + e.message;
    }
    if (!el) return "no-match";

    // <html>, <head> and <body> cannot be replaced via outerHTML — their
    // parent is the Document, which throws NoModificationAllowedError.
    // html-has-lang targets <html> exactly, so this is a common case.
    const isRoot = el === document.documentElement
        || el === document.head
        || el === document.body;

    try {
        if (isRoot) {
            const parsed = new DOMParser().parseFromString(replacement, "text/html");
            const source = parsed.querySelector(el.tagName) || parsed.documentElement;
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
}"""

_APPLIED_OK = ("replaced", "attributes")


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


async def _apply(page: Page, finding: Finding) -> str:
    return await page.evaluate(_APPLY_JS, [finding.selector, finding.patchedCode])


async def _rebuild(page: Page, html: str, accepted: list[Finding]) -> None:
    """Reset to the original DOM and re-apply only what has been accepted."""
    await page.set_content(html, wait_until="domcontentloaded")
    for finding in accepted:
        await _apply(page, finding)


async def verify_patches(
    browser: Browser,
    *,
    page_url: str,
    html: str,
    findings: list[Finding],
) -> VerificationResult:
    """Judge each drafted patch on its own, then report the combined result.

    Findings with no `patchedCode` pass through unverified — there is nothing
    to check yet. That is the stage 1 path: real counts, no patches, so before
    and after are equal and we say so rather than manufacturing a delta.
    """
    context = await browser.new_context(viewport={"width": 1440, "height": 900})
    try:
        page = await context.new_page()
        # Verify against the captured DOM rather than a fresh fetch, so the
        # findings and the check are anchored to identical markup.
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

        # Read what each element announces before anything is touched. This is
        # the only moment the original accessibility tree exists.
        for finding in drafted:
            heard = await announce.announcement_for(context, page, finding.selector)
            if heard is not None:
                finding.announcedBefore = heard.render()

        accepted: list[Finding] = []
        rejected: list[tuple[Finding, str]] = []

        for finding in drafted:
            # Rebuild from the original with only accepted patches, so anything
            # new that appears is attributable to this candidate alone.
            await _rebuild(page, html, accepted)

            outcome = await _apply(page, finding)
            if outcome == "no-match":
                rejected.append((finding, "selector no longer matched at patch time"))
                continue
            if outcome not in _APPLIED_OK:
                rejected.append((finding, f"patch could not be applied: {outcome}"))
                continue

            after_raw = await rule_auditor.run_axe(page)
            after_keys = _violation_keys(after_raw)

            if (finding.category, finding.selector) in after_keys:
                rejected.append(
                    (finding, "original violation still present after the patch")
                )
                continue

            # Accepted patches never introduce anything — that is what this
            # loop enforces — so any new key is this candidate's doing.
            introduced = after_keys - before_keys
            if introduced:
                rules = sorted({rule for rule, _ in introduced})
                rejected.append(
                    (
                        finding,
                        "this patch introduced a new violation: "
                        + ", ".join(rules),
                    )
                )
                continue

            finding.mark_verified()
            accepted.append(finding)

        # Final state: the original plus every accepted patch, nothing else.
        await _rebuild(page, html, accepted)
        final_raw = await rule_auditor.run_axe(page)
        violations_after = rule_auditor.count_violations(final_raw)

        # Read the patched tree once, at the end, so each announcement reflects
        # the DOM we are actually reporting.
        for finding in accepted:
            heard = await announce.announcement_for(context, page, finding.selector)
            if heard is not None:
                finding.announcedAfter = heard.render()

            # The contract promises these two are always both set or both
            # null, because a comparison needs both halves. Enforce it here
            # rather than hoping, and drop the pair in two cases:
            #
            # Unchanged. The fix can still be real — PLACEHOLDER_AS_LABEL adds
            # a persistent <label>, which helps someone who has already started
            # typing, but the computed name was coming from the placeholder and
            # is identical either way. The improvement is genuine; the
            # accessibility tree is simply not where it shows. Rendering
            # "before: X / after: X" reads as "nothing happened", which is
            # worse for the report than showing nothing.
            #
            # Half a pair. An element can be readable on one side and not the
            # other — a patch that replaces an element can change what the tree
            # exposes. One value with nothing to compare it to is not evidence
            # of anything.
            #
            # Either way the finding keeps its diff, changeSummary and
            # userImpact; only the announcement row goes.
            unchanged = finding.announcedBefore == finding.announcedAfter
            incomplete = not (finding.announcedBefore and finding.announcedAfter)
            if unchanged or incomplete:
                finding.announcedBefore = None
                finding.announcedAfter = None

        return VerificationResult(
            violations_before=violations_before,
            violations_after=violations_after,
            verified=[f for f in accepted if f.status is FindingStatus.VERIFIED],
            rejected=rejected,
        )
    finally:
        await context.close()
