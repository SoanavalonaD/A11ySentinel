"""Agent 2 — RuleAuditor. Deterministic, no model involved.

Injects axe-core into the live page, normalises the results into the Finding
schema, and maps each rule to its WCAG and RGAA criteria.

This is the ground truth the whole project rests on. The before/after counts
in the demo come from here and from the Verifier re-running the same engine
against the patched DOM. Nothing in this module may call Gemini — if it did,
the numbers would stop being reproducible.
"""

from __future__ import annotations

from pathlib import Path

from playwright.async_api import Page

from . import wcag_rgaa
from .models import Finding, FindingStatus, Framework, Source

# Vendored rather than fetched from a CDN at runtime: Cloud Run should not
# depend on jsdelivr being up mid-demo, and pinning the file pins the rule
# set, which keeps violation counts reproducible between runs.
AXE_PATH = Path(__file__).parent.parent / "vendor" / "axe.min.js"

# WCAG 2.1 AA. Including best-practice rules would inflate the violation
# count with things that are not actually conformance failures, which would
# undercut the credibility of the numbers.
AXE_RUN_OPTIONS = {
    "runOnly": {"type": "tag", "values": ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]},
    "resultTypes": ["violations"],
}


class AxeNotVendoredError(RuntimeError):
    pass


def _load_axe_source() -> str:
    if not AXE_PATH.exists():
        raise AxeNotVendoredError(
            f"axe-core not found at {AXE_PATH}. Run scripts/fetch_axe.py to "
            "vendor it, or the rule engine cannot run."
        )
    return AXE_PATH.read_text(encoding="utf-8")


async def inject_axe(page: Page) -> None:
    """Load axe-core into the page context."""
    await page.evaluate(_load_axe_source())


async def run_axe(page: Page) -> list[dict]:
    """Run axe against the current DOM and return raw violation objects."""
    await inject_axe(page)
    result = await page.evaluate(
        "async (options) => { const r = await window.axe.run(document, options); "
        "return r.violations; }",
        AXE_RUN_OPTIONS,
    )
    return result or []


async def selector_matches(page: Page, selector: str) -> int:
    """Count elements matching a CSS selector. 0 means the finding is unusable.

    Contract invariant 1 and hard rule 4. Gemini will confidently return
    selectors that match nothing; so, occasionally, will a stale axe target
    after the DOM has been patched. Every finding passes through here before
    it is written.
    """
    if not selector:
        return 0
    try:
        return await page.evaluate(
            "(sel) => { try { return document.querySelectorAll(sel).length; } "
            "catch (e) { return -1; } }",
            selector,
        )
    except Exception:
        # A selector that throws in the page is as useless as one that
        # matches nothing. Treat both as a discard.
        return 0


def count_violations(raw_violations: list[dict]) -> int:
    """Total violation instances, not rule types.

    A page with one `image-alt` rule failing across twelve images has twelve
    violations, not one. Counting rule types would understate the problem and
    make the before/after delta look smaller than it is.
    """
    return sum(len(v.get("nodes", [])) for v in raw_violations)


async def normalise(
    page: Page,
    raw_violations: list[dict],
    *,
    page_url: str,
    framework: Framework,
    screenshot_ref: str | None = None,
    start_index: int = 1,
) -> tuple[list[Finding], list[str]]:
    """Turn raw axe output into contract-shaped Findings.

    Returns (findings, discard_reasons). Discards are returned rather than
    logged away so the caller can report honestly how many candidates were
    dropped and why.

    Only targeted rules become Findings. Non-targeted violations still count
    toward violationsBefore via `count_violations` — we report what we found,
    we just do not draft fixes for everything.
    """
    findings: list[Finding] = []
    discards: list[str] = []
    index = start_index

    for violation in raw_violations:
        rule_id = violation.get("id", "")
        mapping = wcag_rgaa.mapping_for(rule_id)
        if mapping is None:
            discards.append(f"{rule_id}: not a targeted rule, counted but not fixed")
            continue

        severity = wcag_rgaa.severity_from_impact(violation.get("impact"))

        for node in violation.get("nodes", []):
            # axe returns target as a list of selectors, one per frame level.
            # We do not audit inside cross-origin frames, so the last entry is
            # the selector within the document we captured.
            target = node.get("target") or []
            selector = target[-1] if target else ""

            matches = await selector_matches(page, selector)
            if matches < 1:
                discards.append(
                    f"{rule_id}: selector {selector!r} matched {matches} elements, discarded"
                )
                continue

            findings.append(
                Finding(
                    findingId=f"f_{index:03d}",
                    pageUrl=page_url,
                    source=Source.AXE,
                    category=rule_id,
                    wcagCriterion=mapping.wcag,
                    rgaaCriterion=mapping.rgaa,
                    severity=severity,
                    # Fallback impact text so Stage 1 reads well with no
                    # Gemini in the loop. TriageAgent overwrites this later.
                    userImpact=mapping.user_impact,
                    evidence=None,
                    selector=selector,
                    xpath=None,
                    currentCode=node.get("html", ""),
                    patchedCode=None,
                    changeSummary=None,
                    requiresHumanInput=False,
                    humanGuidance=None,
                    framework=framework,
                    # Deterministic engine. Not a guess.
                    confidence=1.0,
                    # A real violation with no fix drafted. This is the
                    # honest stage 1 state: reportable, but claiming nothing.
                    status=FindingStatus.DETECTED,
                    verified=False,
                    triageRank=None,
                    screenshotRef=screenshot_ref,
                )
            )
            index += 1

    return findings, discards


def fallback_triage(findings: list[Finding]) -> list[Finding]:
    """Stand-in for agent 4, so Stage 1 produces ordered output with no model.

    Sorts by severity then by our own rule priority, and assigns triageRank.
    If TriageAgent ships, it replaces this wholesale.
    """
    ordered = sorted(
        findings,
        key=lambda f: wcag_rgaa.fallback_rank(f.category, f.severity),
    )
    for rank, finding in enumerate(ordered, start=1):
        finding.triageRank = rank
    return ordered
