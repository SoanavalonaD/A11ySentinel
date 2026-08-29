"""Agent 3 — VisualAuditor. Finds what a rule engine structurally cannot.

axe is a rule engine: it can tell you an `alt` attribute is missing, but not
that `alt="img_1234.jpg"` is useless. It can compute contrast against a solid
background, but not against a photograph. It accepts a `placeholder` as an
accessible name, so a field labelled only by its placeholder passes every
automated check and still fails the person filling it in.

Those gaps need judgement, and judgement needs eyes. This agent gets the
screenshot, the stripped DOM, and the list of what axe already found — that
last part matters as much as the first two, because a finding axe already
reported is not insight, it is noise.

Two defences, both in code rather than in the prompt:

  1. **Every selector is queried against the real DOM.** Gemini will
     confidently return selectors matching nothing. Hard rule 4, and the single
     most important defensive check in the pipeline.
  2. **The model never supplies criterion numbers.** It picks a category; the
     WCAG and RGAA criteria come from the table below. A model asked for a
     criterion number will produce a plausible one whether or not it is right.

`SUSPICIOUS_CONTENT` is handled separately. Text in a page trying to redirect
the model is a security observation, not an accessibility violation, and
filing it as a Finding would put a fake WCAG criterion on it.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field

from playwright.async_api import Page

from . import prompts, rule_auditor
from .models import DEFAULT_MIN_CONFIDENCE, Finding, Framework, Severity, Source

DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.7-flash")
VERTEX_LOCATION = os.getenv("VERTEX_LOCATION", "global")

# We pay per character of DOM. Enough to reason over structure, not so much
# that a large page costs more than the finding is worth.
MAX_DOM_CHARS = int(os.getenv("VISUAL_MAX_DOM_CHARS", "60000"))

# Category -> (WCAG, RGAA). Assigned in code so the model cannot invent one.
# RGAA is a cross-reference, surfaced only where the jurisdiction detector says
# that framework is relevant.
CATEGORY_CRITERIA: dict[str, tuple[str, str | None]] = {
    "USELESS_ALT": ("1.1.1", "1.3"),
    "DECORATIVE_MISLABELLED": ("1.1.1", "1.2"),
    "MEANINGLESS_LINK_TEXT": ("2.4.4", "6.1"),
    "CONTRAST_OVER_IMAGE": ("1.4.3", "3.2"),
    "VISUAL_ORDER_MISMATCH": ("1.3.2", "10.3"),
    "FAKE_HEADING": ("1.3.1", "9.1"),
    "PLACEHOLDER_AS_LABEL": ("3.3.2", "11.1"),
    "SMALL_TOUCH_TARGET": ("2.5.8", "13.11"),
    "TEXT_IN_IMAGE": ("1.4.5", "1.1"),
    "COLOUR_ONLY_MEANING": ("1.4.1", "3.1"),
}

# Not an accessibility violation — a security observation about the page.
SECURITY_CATEGORY = "SUSPICIOUS_CONTENT"


@dataclass
class VisualAuditResult:
    findings: list[Finding] = field(default_factory=list)
    # Page text that tried to instruct the model. Reported, never obeyed.
    suspicious: list[str] = field(default_factory=list)
    # Why candidates were dropped. Surfaced rather than hidden: if the model is
    # producing mostly unanchored findings, we need to see that.
    discards: list[str] = field(default_factory=list)
    model_used: bool = False


def trim_dom(html: str, *, max_chars: int = MAX_DOM_CHARS) -> str:
    """Strip what the model cannot use and we should not pay for.

    Scripts and styles are the bulk of a modern page and carry nothing this
    agent reasons about. Inline handlers and comments are removed too — both
    are places instructions could hide, and neither affects the judgement.
    """
    out = re.sub(r"<script\b[^>]*>.*?</script>", "", html, flags=re.S | re.I)
    out = re.sub(r"<style\b[^>]*>.*?</style>", "", out, flags=re.S | re.I)
    out = re.sub(r"<!--.*?-->", "", out, flags=re.S)
    out = re.sub(r"\son[a-z]+\s*=\s*\"[^\"]*\"", "", out, flags=re.I)
    out = re.sub(r"\son[a-z]+\s*=\s*'[^']*'", "", out, flags=re.I)
    out = re.sub(r"[ \t]+", " ", out)
    out = re.sub(r"\n\s*\n+", "\n", out)

    if len(out) > max_chars:
        out = out[:max_chars] + "\n<!-- DOM truncated -->"
    return out.strip()


def summarise_axe(findings: list[Finding]) -> str:
    """What axe already found, compactly.

    The model needs this to avoid duplicating it. Rule plus selector is enough
    to recognise an overlap without spending tokens on the full finding.
    """
    if not findings:
        return "(none)"
    lines = []
    for f in findings[:60]:
        lines.append(f"- {f.category} at {f.selector}")
    if len(findings) > 60:
        lines.append(f"- ... and {len(findings) - 60} more")
    return "\n".join(lines)


def _client():
    from google import genai

    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    if not project:
        raise RuntimeError("GOOGLE_CLOUD_PROJECT is not set")
    return genai.Client(vertexai=True, project=project, location=VERTEX_LOCATION)


async def audit(
    page: Page,
    *,
    screenshot_png: bytes | None,
    html: str,
    page_url: str,
    axe_findings: list[Finding],
    language: str | None = None,
    framework: Framework = Framework.UNKNOWN,
    regional_framework: str | None = None,
    client=None,
    model: str = DEFAULT_MODEL,
    start_index: int = 1,
    min_confidence: float | None = None,
) -> VisualAuditResult:
    """Look at the page and report only what axe could not have found.

    `page` must already have the audited DOM loaded — every returned selector
    is queried against it before the finding is kept.
    """
    from google.genai import types

    result = VisualAuditResult()
    if min_confidence is None:
        min_confidence = float(os.getenv("MIN_CONFIDENCE", str(DEFAULT_MIN_CONFIDENCE)))

    if not screenshot_png:
        result.discards.append(
            "no screenshot captured — the visual auditor cannot run blind"
        )
        return result

    parts: list[object] = [
        types.Part.from_bytes(data=screenshot_png, mime_type="image/png"),
        types.Part.from_text(
            text=prompts.build_visual_auditor_user_prompt(
                page_url=page_url,
                language=language,
                axe_summary=summarise_axe(axe_findings),
                dom=trim_dom(html),
            )
        ),
    ]

    try:
        client = client or _client()
        response = await client.aio.models.generate_content(
            model=model,
            contents=types.Content(role="user", parts=parts),
            config=types.GenerateContentConfig(
                system_instruction=prompts.VISUAL_AUDITOR_SYSTEM,
                # Slightly above zero: judgement calls benefit from a little
                # room, unlike the Remediator where determinism matters more.
                temperature=0.1,
                response_mime_type="application/json",
                response_schema=prompts.VISUAL_AUDITOR_RESPONSE_SCHEMA,
                max_output_tokens=8192,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(
                    disable=True
                ),
            ),
        )
        data = json.loads((response.text or "").strip())
        result.model_used = True
    except Exception as exc:  # noqa: BLE001
        result.discards.append(
            f"visual audit failed, continuing without it: {type(exc).__name__}: {exc}"
        )
        return result

    seen_axe = {(f.category, f.selector) for f in axe_findings}
    index = start_index

    for item in data.get("findings", []):
        category = (item.get("category") or "").strip().upper()
        selector = (item.get("selector") or "").strip()

        if category == SECURITY_CATEGORY:
            # Never a Finding: it has no WCAG criterion, and giving it one
            # would be inventing a violation that does not exist.
            result.suspicious.append(
                (item.get("evidence") or item.get("userImpact") or "").strip()
                or "unspecified suspicious content"
            )
            continue

        criteria = CATEGORY_CRITERIA.get(category)
        if criteria is None:
            result.discards.append(
                f"unknown category {category!r} — not in the agreed list, discarded"
            )
            continue

        confidence = float(item.get("confidence") or 0.0)
        if not 0.0 <= confidence <= 1.0:
            result.discards.append(
                f"{category}: confidence {confidence} outside 0.0-1.0, discarded"
            )
            continue
        if confidence < min_confidence:
            result.discards.append(
                f"{category} at {selector!r}: confidence {confidence:.2f} below "
                f"the {min_confidence} floor, discarded"
            )
            continue

        # Hard rule 4. The single most important check in the pipeline.
        matches = await rule_auditor.selector_matches(page, selector)
        if matches < 1:
            result.discards.append(
                f"{category}: selector {selector!r} matched {matches} elements, "
                "discarded as unanchored"
            )
            continue

        if any(sel == selector for _, sel in seen_axe):
            result.discards.append(
                f"{category} at {selector!r}: axe already reported this element, "
                "discarded as duplicate"
            )
            continue

        wcag, rgaa = criteria
        current_code = await page.evaluate(
            "(sel) => { const el = document.querySelector(sel);"
            " return el ? el.outerHTML.slice(0, 600) : ''; }",
            selector,
        )

        result.findings.append(
            Finding(
                findingId=f"f_{index:03d}",
                pageUrl=page_url,
                source=Source.VISUAL,
                category=category,
                wcagCriterion=wcag,
                # Only surfaced when the jurisdiction detector says RGAA is the
                # relevant framework; otherwise the criterion is meaningless.
                regionalFramework=regional_framework,
                regionalCriterion=rgaa if regional_framework == "RGAA 4" else None,
                severity=Severity(item.get("severity", "moderate")),
                userImpact=(item.get("userImpact") or "").strip(),
                evidence=(item.get("evidence") or "").strip(),
                selector=selector,
                currentCode=current_code or f"<!-- {selector} -->",
                framework=framework,
                confidence=confidence,
            )
        )
        index += 1

    return result
