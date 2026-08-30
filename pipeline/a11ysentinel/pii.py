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

**Two directions, two mechanisms.**

Text that only travels *outward* — a page DOM sent to the VisualAuditor, the
model's own prose — is redacted with `redact`, one way, values gone.

Text that must go to a model *and come back* — the element HTML the Remediator
patches — uses `redact_reversible`. The model sees tokens; the originals are
restored before the patch is judged or applied. A patch containing
"[REDACTED:EMAIL:1]" would replace a live address with a placeholder, breaking
the client's page in the name of protecting it, so a token that fails to
survive the round trip causes the patch to be refused.

**What is deliberately left intact in storage.** The `currentCode` and
`patchedCode` written to Firestore hold the real values. The proxy applies a
patch by matching it against the real DOM, and the report goes to the operator
of the site the data is already published on. Redaction here is about not
disclosing personal data to a *third party* — Google's models — not about
hiding a site's own contact page from its owner.

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


# Reversible redaction, for text that must go to a model and come back.
#
# The Remediator sends an element's HTML to Gemini and receives a patched
# version. Redacting on the way out is not enough on its own: the patch has to
# be applied to the real page, and a patch containing "[REDACTED:EMAIL:1]"
# would replace a live address with a placeholder — breaking the client's page
# in the name of protecting it.
#
# So the values are swapped for indexed tokens before the call and swapped back
# after. If a token does not survive the round trip, the patch is refused
# rather than applied: see `has_placeholder`.

_TOKEN = "[REDACTED:{kind}:{index}]"
_TOKEN_PATTERN = re.compile(r"\[REDACTED:[A-Z]+:\d+\]")


def redact_reversible(text: str | None) -> tuple[str, dict[str, str]]:
    """Redact, keeping a map back to the originals.

    Returns (redacted_text, {token: original}).
    """
    if not text:
        return text or "", {}

    mapping: dict[str, str] = {}
    counter = {"n": 0}
    out = text

    for kind, pattern in _PATTERNS:
        def _sub(match: re.Match[str], kind: str = kind) -> str:
            value = match.group(0)
            if kind == "CARD" and not _luhn_ok(value):
                return value
            counter["n"] += 1
            token = _TOKEN.format(kind=kind, index=counter["n"])
            mapping[token] = value
            return token

        out = pattern.sub(_sub, out)

    return out, mapping


def restore(text: str | None, mapping: dict[str, str]) -> str:
    """Put the original values back."""
    if not text or not mapping:
        return text or ""
    out = text
    for token, value in mapping.items():
        out = out.replace(token, value)
    return out


def has_placeholder(text: str | None) -> bool:
    """True if any redaction token survived, meaning restoration failed.

    A patch in this state must never be applied — it would write a placeholder
    into a live page.
    """
    return bool(text) and bool(_TOKEN_PATTERN.search(text))
