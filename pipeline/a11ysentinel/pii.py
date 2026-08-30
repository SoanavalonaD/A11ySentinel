"""Redact personal data before it reaches a model or a report.

We ingest arbitrary third-party pages. A contact page carries staff emails, a
booking form carries a phone number, an invoice template carries an IBAN. None
of that is needed to judge accessibility, and all of it would otherwise be sent
to Gemini and written into a report we email to someone.

**Why this is local regex rather than Cloud DLP.** DLP is the better classifier
and the obvious Google Cloud answer, but redaction has to be *fail-closed*: if
the classifier is unreachable we must not fall back to sending the raw page.
A network call in this position gives two bad options — block the audit, or
leak. A local pass has neither failure mode, costs nothing per page, and adds
no latency to an audit that already runs a browser. DLP is the right upgrade
for production, where an audit can afford to fail.

**What is deliberately NOT redacted.** `currentCode` and `patchedCode` are left
intact. The proxy applies a patch by matching it against the real DOM, so a
redacted snippet would simply fail to apply — and a patch that cannot be
applied is worse than useless, it is a fix that looks real and does nothing.
Those fields are structural markup, and the redaction here targets the text
sent to models and the prose that ends up in a report.

Conservative by design. Over-redaction damages the audit — an `alt` attribute
reading `[REDACTED]` would produce a nonsense finding — so each pattern is
narrow and anchored.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# Each pattern is deliberately tight. A loose phone pattern in particular will
# eat prices, dates and postcodes, and a page full of [REDACTED] tells the
# model nothing about its own accessibility.
_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "EMAIL",
        re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    ),
    (
        # International format only. A bare local number is indistinguishable
        # from an order reference, and guessing wrong costs more than missing.
        "PHONE",
        re.compile(r"\+\d{1,3}[\s.\-]?(?:\(?\d{1,4}\)?[\s.\-]?){2,5}\d{2,4}\b"),
    ),
    (
        "IBAN",
        re.compile(r"\b[A-Z]{2}\d{2}[\s]?(?:[A-Z0-9]{4}[\s]?){2,7}[A-Z0-9]{1,4}\b"),
    ),
    (
        # 13-16 digits in card-like grouping. Validated by Luhn below so that
        # order numbers and SKUs survive.
        "CARD",
        re.compile(r"\b(?:\d[ -]?){13,16}\b"),
    ),
)

REDACTION = "[REDACTED:{kind}]"


@dataclass
class RedactionReport:
    """What was removed. Counts only — never the values themselves.

    Logging what we redacted would recreate the leak we just prevented.
    """

    text: str
    counts: dict[str, int] = field(default_factory=dict)

    @property
    def total(self) -> int:
        return sum(self.counts.values())

    def summary(self) -> str:
        if not self.counts:
            return "no personal data detected"
        parts = ", ".join(f"{n} {kind.lower()}" for kind, n in sorted(self.counts.items()))
        return f"redacted {parts}"


def _luhn_ok(digits: str) -> bool:
    """Card check. Keeps order numbers and SKUs out of the redaction."""
    nums = [int(c) for c in digits if c.isdigit()]
    if len(nums) < 13:
        return False
    total = 0
    for i, n in enumerate(reversed(nums)):
        if i % 2:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def redact(text: str | None) -> RedactionReport:
    """Replace personal data with typed placeholders.

    The placeholder keeps the *kind* visible, because a model reasoning about a
    form benefits from knowing a field contained an email even when the address
    itself is gone.
    """
    if not text:
        return RedactionReport(text=text or "")

    counts: dict[str, int] = {}
    out = text

    for kind, pattern in _PATTERNS:
        def _sub(match: re.Match[str], kind: str = kind) -> str:
            value = match.group(0)
            if kind == "CARD" and not _luhn_ok(value):
                return value
            counts[kind] = counts.get(kind, 0) + 1
            return REDACTION.format(kind=kind)

        out = pattern.sub(_sub, out)

    return RedactionReport(text=out, counts=counts)


def redact_finding_prose(finding) -> list[str]:
    """Redact the free text on a finding that a person will read.

    Model-written prose can quote the page — `userImpact` describing "the field
    labelled jean@example.fr" would carry the address into the report and the
    outreach email.

    `currentCode` and `patchedCode` are left alone on purpose; see the module
    docstring. Returns a list of note strings describing what was removed.
    """
    notes: list[str] = []
    for attr in ("userImpact", "evidence", "humanGuidance", "changeSummary"):
        value = getattr(finding, attr, None)
        if not value:
            continue
        report = redact(value)
        if report.total:
            setattr(finding, attr, report.text)
            notes.append(f"{finding.findingId}.{attr}: {report.summary()}")
    return notes
