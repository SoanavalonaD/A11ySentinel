"""Which regional accessibility framework probably applies to a page.

**The audit never changes.** We measure against WCAG 2.1 A/AA, always, because
that is the global standard and every regional framework here either derives
from it or references it directly. This module only decides which *label* to
show alongside the WCAG criterion. Nothing it returns affects what is
detected, patched or verified.

That distinction matters legally as much as technically. Which law binds a
given site depends on who operates it, where they are established, and what
sector they are in — none of which is knowable from a web page. So this
returns a *likely* framework with the signals it used, and the caller is
expected to present it as context, never as a determination.

Never say "RGAA compliant" or "meets EN 301 549". Say "WCAG 1.1.1 — the
equivalent criterion under RGAA 4 is 1.3". The first is a legal claim we
cannot make; the second is a factual cross-reference.
"""

from __future__ import annotations

import re
import urllib.parse
from dataclasses import dataclass, field


@dataclass
class Jurisdiction:
    """A guess, with its evidence attached so it can be shown, not asserted."""

    framework: str | None
    confidence: float
    signals: list[str] = field(default_factory=list)

    def explain(self) -> str:
        if not self.framework:
            return "no regional framework inferred; WCAG 2.1 AA applies globally"
        return (
            f"{self.framework} likely applies "
            f"({', '.join(self.signals)}); WCAG 2.1 AA measured regardless"
        )


# Only frameworks we can name accurately. Each of these adopts or references
# WCAG 2.1 AA as its technical requirement, which is exactly why measuring
# WCAG serves all of them.
EN_301_549 = "EN 301 549"
RGAA = "RGAA 4"
SECTION_508 = "Section 508"
AODA = "AODA"
BITV = "BITV 2.0"

# Country code TLD -> framework. Deliberately short: a ccTLD is weak evidence
# of where a business operates, so only entries we would defend are listed.
_TLD_FRAMEWORK: dict[str, str] = {
    "fr": RGAA,
    "de": BITV,
    "ca": AODA,
    "gov": SECTION_508,
    "mil": SECTION_508,
    "eu": EN_301_549,
    "be": EN_301_549,
    "nl": EN_301_549,
    "es": EN_301_549,
    "it": EN_301_549,
    "pt": EN_301_549,
    "ie": EN_301_549,
    "se": EN_301_549,
    "dk": EN_301_549,
    "fi": EN_301_549,
    "pl": EN_301_549,
    "at": EN_301_549,
}

# Language subtag -> framework, used only when the TLD says nothing. Weaker
# still: French is spoken well beyond France.
_LANG_FRAMEWORK: dict[str, str] = {
    "fr": RGAA,
    "de": BITV,
}

# We hold a genuine, checked WCAG -> criterion mapping only for RGAA. For every
# other framework we can name it accurately but must not invent criterion
# numbers — see hard rule 5. Callers use this to decide whether to populate
# `regionalCriterion` at all.
FRAMEWORKS_WITH_CRITERION_MAPPING = frozenset({RGAA})


def _region_from_lang(lang: str) -> tuple[str | None, str | None]:
    """Split a BCP 47 tag into (language, region), both lowercase or None."""
    if not lang:
        return None, None
    parts = re.split(r"[-_]", lang.strip())
    language = parts[0].lower() if parts and parts[0] else None
    region = None
    for part in parts[1:]:
        if len(part) == 2 and part.isalpha():
            region = part.lower()
            break
    return language, region


def detect(
    url: str, *, lang: str | None = None, html: str | None = None
) -> Jurisdiction:
    """Infer the likely regional framework from page metadata.

    Evidence is weighted: an explicit region in `lang` beats a ccTLD, which
    beats a bare language subtag. Anything below the threshold returns None,
    because a wrong framework label is worse than no label.
    """
    signals: list[str] = []
    candidates: list[tuple[str, float, str]] = []

    language, region = _region_from_lang(lang or "")

    # Strongest available signal: the page states its own region.
    if region:
        framework = _TLD_FRAMEWORK.get(region)
        if framework:
            candidates.append((framework, 0.8, f'lang="{lang}" declares region {region.upper()}'))

    host = urllib.parse.urlsplit(url).hostname or ""
    tld = host.rsplit(".", 1)[-1].lower() if "." in host else ""
    if tld:
        framework = _TLD_FRAMEWORK.get(tld)
        if framework:
            candidates.append((framework, 0.6, f".{tld} domain"))

    if language and not region:
        framework = _LANG_FRAMEWORK.get(language)
        if framework:
            candidates.append(
                (framework, 0.35, f'lang="{language}" with no region given')
            )

    # hreflang alternates say which markets a site targets. Corroboration only:
    # it raises confidence in a framework already suggested, never introduces
    # one on its own.
    if html:
        alternates = set(re.findall(r'hreflang=["\']([A-Za-z\-_]+)["\']', html))
        if alternates:
            signals.append(f"{len(alternates)} hreflang alternates")

    if not candidates:
        return Jurisdiction(
            framework=None,
            confidence=0.0,
            signals=signals or ["no regional signal found"],
        )

    candidates.sort(key=lambda c: c[1], reverse=True)
    framework, confidence, why = candidates[0]
    signals.insert(0, why)

    # Two independent signals agreeing is worth more than either alone.
    agreeing = [c for c in candidates[1:] if c[0] == framework]
    if agreeing:
        confidence = min(0.95, confidence + 0.15)
        signals.append(agreeing[0][2])

    # Below this a label would be a guess dressed as information.
    if confidence < 0.5:
        return Jurisdiction(
            framework=None,
            confidence=confidence,
            signals=signals + ["too weak to name a framework"],
        )

    return Jurisdiction(framework=framework, confidence=confidence, signals=signals)


def criterion_is_meaningful(framework: str | None) -> bool:
    """True only where we hold a real WCAG -> criterion mapping.

    Naming a framework is a factual cross-reference. Producing a criterion
    number we have not verified would be fabrication.
    """
    return framework in FRAMEWORKS_WITH_CRITERION_MAPPING
