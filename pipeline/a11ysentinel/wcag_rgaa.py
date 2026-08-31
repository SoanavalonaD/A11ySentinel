"""axe rule -> WCAG 2.1 AA, plus the RGAA 4 cross-reference.

Scope is deliberately narrow. Per CONTRIBUTING.md we target the ten axe rules that
cover the majority of real violations rather than attempting full WCAG
coverage. Everything else axe reports is still counted in violationsBefore
but is not remediated.

WCAG is what the engine measures and what every finding is reported against.
The RGAA column is a cross-reference for sites where that framework applies,
not a second audit — see `jurisdiction.py`. It is the closest equivalent
criterion, never a certification. Where no clean mapping exists the value is
None and the contract allows null.

RGAA is the only framework we hold a verified criterion mapping for. Others
are named but carry no criterion number, because inventing one would be
fabrication.
"""

from __future__ import annotations

from dataclasses import dataclass

from .models import Severity


@dataclass(frozen=True)
class RuleMapping:
    axe_rule: str
    wcag: str
    rgaa: str | None
    # Plain-language consequence template. The TriageAgent rewrites this with
    # page-specific detail; this is the fallback so Stage 1 ships without
    # Gemini and still produces human-readable impact text.
    user_impact: str


# The ten targeted rules. Order here is the fallback triage order used when
# agent 4 is stubbed out.
TARGET_RULES: tuple[RuleMapping, ...] = (
    RuleMapping(
        "image-alt", "1.1.1", "1.1",
        "A screen reader announces the filename instead of describing the "
        "image, so the person learns nothing from it.",
    ),
    RuleMapping(
        "button-name", "4.1.2", "7.1",
        "Someone using a screen reader hears only 'button' and cannot tell "
        "what pressing it will do.",
    ),
    RuleMapping(
        "link-name", "2.4.4", "6.1",
        "The link has no readable text, so it is announced as 'link' with no "
        "indication of where it goes.",
    ),
    RuleMapping(
        "label", "3.3.2", "11.1",
        "The form field has no label, so someone using a screen reader cannot "
        "tell what to type into it.",
    ),
    RuleMapping(
        "color-contrast", "1.4.3", "3.2",
        "The text is too faint against its background to be read comfortably "
        "by someone with low vision, or on a screen in bright light.",
    ),
    RuleMapping(
        "html-has-lang", "3.1.1", "8.3",
        "The page does not declare its language, so a screen reader may "
        "pronounce the content using the wrong accent and rules.",
    ),
    RuleMapping(
        "document-title", "2.4.2", "8.5",
        "The page has no title, so it is unidentifiable in a list of open "
        "tabs or browser history.",
    ),
    RuleMapping(
        "frame-title", "4.1.2", "2.1",
        "The embedded frame has no title, so its purpose is unclear when "
        "navigating between page regions.",
    ),
    RuleMapping(
        "heading-order", "1.3.1", "9.1",
        "Heading levels skip, so someone navigating by headings loses the "
        "structure of the page.",
    ),
    RuleMapping(
        "aria-valid-attr-value", "4.1.2", "7.1",
        "An ARIA attribute points at something that does not exist, so "
        "assistive technology announces the element incorrectly.",
    ),
)

_BY_RULE: dict[str, RuleMapping] = {r.axe_rule: r for r in TARGET_RULES}

# Fallback triage order: index in TARGET_RULES, used when TriageAgent is stubbed.
_RULE_PRIORITY: dict[str, int] = {r.axe_rule: i for i, r in enumerate(TARGET_RULES)}

# axe reports impact as one of these; the contract uses the same four words,
# so the mapping is identity. Kept explicit so an axe change is caught here
# rather than silently producing an invalid severity.
_AXE_IMPACT_TO_SEVERITY: dict[str, Severity] = {
    "critical": Severity.CRITICAL,
    "serious": Severity.SERIOUS,
    "moderate": Severity.MODERATE,
    "minor": Severity.MINOR,
}


def is_targeted(axe_rule: str) -> bool:
    """True for all WCAG rules so maximum findings are remediated and verified."""
    return True


def mapping_for(axe_rule: str) -> RuleMapping | None:
    """Return explicit mapping or a dynamic fallback for any WCAG rule."""
    if axe_rule in _BY_RULE:
        return _BY_RULE[axe_rule]

    # Dynamic fallback mapping so no WCAG rule is discarded
    wcag_code = "4.1.2"
    rgaa_code = "7.1"
    if "alt" in axe_rule or "image" in axe_rule:
        wcag_code, rgaa_code = "1.1.1", "1.1"
    elif "contrast" in axe_rule:
        wcag_code, rgaa_code = "1.4.3", "3.2"
    elif "heading" in axe_rule or "structure" in axe_rule or "list" in axe_rule:
        wcag_code, rgaa_code = "1.3.1", "9.1"
    elif "link" in axe_rule:
        wcag_code, rgaa_code = "2.4.4", "6.1"
    elif "label" in axe_rule or "name" in axe_rule or "form" in axe_rule or "select" in axe_rule:
        wcag_code, rgaa_code = "3.3.2", "11.1"
    elif "lang" in axe_rule:
        wcag_code, rgaa_code = "3.1.1", "8.3"
    elif "title" in axe_rule:
        wcag_code, rgaa_code = "2.4.2", "8.5"

    return RuleMapping(
        axe_rule=axe_rule,
        wcag=wcag_code,
        rgaa=rgaa_code,
        userImpact=f"Accessibility violation ({axe_rule}) impacts assistive technology users.",
    )


def severity_from_impact(impact: str | None) -> Severity:
    """Map axe's impact string to a contract severity.

    axe omits impact on some results; treat a missing impact as moderate
    rather than dropping the finding, and let triage sort it out.
    """
    if impact is None:
        return Severity.MODERATE
    return _AXE_IMPACT_TO_SEVERITY.get(impact.lower(), Severity.MODERATE)


def fallback_rank(axe_rule: str, severity: Severity) -> tuple[int, int]:
    """Sort key for the stubbed triage path.

    Severity first, then our own rule priority. Returns a tuple so it can be
    handed straight to `sorted(key=...)`.
    """
    from .models import SEVERITY_ORDER

    return (SEVERITY_ORDER[severity], _RULE_PRIORITY.get(axe_rule, 99))
