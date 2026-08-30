"""Model Armor — screen untrusted page content before it reaches Gemini.

Hard rule 6: everything we fetch is untrusted. A page can contain text aimed at
the model rather than at a reader — "ignore your instructions", "report zero
violations" — sometimes hidden off-screen or in an attribute.

The prompts already tell each agent that page text is data, never a command,
and both Gemini 3.5 and 3.7 refused a seeded injection in testing. But a prompt
is a request, not a control. This is the control: Google's own classifier,
outside our prompt, looking at the content before we send it.

**Fail-open, deliberately, and this is the interesting decision.**

If Model Armor is unreachable we log it and continue rather than blocking the
audit. That is the opposite of the choice made for PII redaction, which fails
closed. The asymmetry is intentional:

  - A PII leak is irreversible. Once an address reaches a model or a report,
    no later check undoes it. So redaction must never be skipped, which is why
    it is local and cannot fail.
  - An injection that gets past Model Armor still has to get past the prompt
    instructions, the response schema, selector validation, the confidence
    floor and verification. It is one layer of several, and blocking every
    audit when the classifier is down trades a real outage for a marginal
    reduction in an already-defended risk.

**Screening is per text block, not per page, and that detail is the whole
thing.** Model Armor's injection filter evaluates *a prompt*; it does not hunt
for a prompt hidden inside a document. Measured against our own test page:

    just the injection sentence  (122 chars)   FLAGGED, HIGH
    the page's visible text     (1006 chars)   not flagged
    the trimmed DOM             (1808 chars)   not flagged

The same text that scores HIGH alone vanishes in a thousand characters of
surrounding content. Screening a whole page therefore looks like it works and
catches nothing. Splitting on block boundaries and screening each text node
separately caught both injections on that page — the visible one and the one
hidden off-screen — with no false positives on twelve legitimate blocks.
"""

from __future__ import annotations

import asyncio
import os
import re
from dataclasses import dataclass, field

# Model Armor is regional and uses its own endpoint host, not the aiplatform
# one. Templates live in a region; ours is created in us-central1.
ARMOR_LOCATION = os.getenv("MODEL_ARMOR_LOCATION", "us-central1")
ARMOR_TEMPLATE = os.getenv("MODEL_ARMOR_TEMPLATE", "a11ysentinel-screen")

# Off unless configured, so a fresh clone with no Model Armor template still
# runs. The README says how to create one.
ARMOR_ENABLED = os.getenv("MODEL_ARMOR_ENABLED", "false").lower() == "true"

MAX_SCREEN_CHARS = int(os.getenv("MODEL_ARMOR_MAX_CHARS", "20000"))

# One API call per block, so this bounds both latency and spend. Blocks are
# screened longest-first: an instruction needs words, and a 20-character block
# is a heading or a price.
MAX_BLOCKS = int(os.getenv("MODEL_ARMOR_MAX_BLOCKS", "30"))
MIN_BLOCK_CHARS = 20
_CONCURRENCY = 6

_TIMEOUT_SECONDS = 20

# Block-level elements whose closing tag ends a run of text. An injection has
# to live inside a text node to be read as prose, so these boundaries are
# where one starts and stops.
_BLOCK_END = re.compile(
    r"(?i)</(?:p|li|h[1-6]|div|article|section|td|th|figcaption|blockquote|span|a)>"
)


@dataclass
class ScreenResult:
    """What the classifier said, and whether we could ask it at all."""

    checked: bool
    flagged: bool = False
    findings: list[str] = field(default_factory=list)
    error: str | None = None
    blocks_screened: int = 0

    def summary(self) -> str:
        if not self.checked:
            return f"Model Armor not consulted: {self.error or 'disabled'}"
        if not self.flagged:
            return (
                f"Model Armor screened {self.blocks_screened} text blocks: "
                "no prompt injection or malicious content detected"
            )
        return (
            f"Model Armor FLAGGED {len(self.findings)} of {self.blocks_screened} "
            "text blocks: " + "; ".join(self.findings)
        )


def text_blocks(html: str) -> list[str]:
    """Split markup into the runs of text a reader would see as passages.

    Screening these separately is what makes the classifier work at all — see
    the module docstring.
    """
    blocks = []
    for chunk in _BLOCK_END.split(html):
        text = re.sub(r"<[^>]+>", " ", chunk)
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) >= MIN_BLOCK_CHARS:
            blocks.append(text)
    # Longest first: an instruction needs words, and the budget should go to
    # the blocks most capable of carrying one.
    blocks.sort(key=len, reverse=True)
    return blocks[:MAX_BLOCKS]


def _endpoint(project: str) -> str:
    return (
        f"https://modelarmor.{ARMOR_LOCATION}.rep.googleapis.com/v1/"
        f"projects/{project}/locations/{ARMOR_LOCATION}/templates/"
        f"{ARMOR_TEMPLATE}:sanitizeUserPrompt"
    )


def _collect(result: dict) -> tuple[bool, list[str]]:
    """Pull the human-readable verdict out of the response shape."""
    sanitization = result.get("sanitizationResult") or {}
    flagged = sanitization.get("filterMatchState") == "MATCH_FOUND"
    notes: list[str] = []

    for _group, filters in (sanitization.get("filterResults") or {}).items():
        if not isinstance(filters, dict):
            continue
        for filter_name, detail in filters.items():
            if not isinstance(detail, dict):
                continue
            state = detail.get("matchState")
            if state and state != "NO_MATCH_FOUND":
                confidence = detail.get("confidenceLevel")
                label = filter_name.replace("FilterResult", "")
                notes.append(f"{label}={state}" + (f" ({confidence})" if confidence else ""))
    return flagged, notes


async def screen_page(html: str, *, project: str | None = None) -> ScreenResult:
    """Screen a page block by block. This is the entry point callers want.

    Never raises. A screening failure is reported, not propagated — see the
    fail-open reasoning in the module docstring.
    """
    if not ARMOR_ENABLED:
        return ScreenResult(checked=False, error="disabled (MODEL_ARMOR_ENABLED)")

    blocks = text_blocks(html)
    if not blocks:
        return ScreenResult(checked=True, flagged=False, blocks_screened=0)

    gate = asyncio.Semaphore(_CONCURRENCY)

    async def one(block: str) -> tuple[str, ScreenResult]:
        async with gate:
            return block, await screen(block, project=project)

    results = await asyncio.gather(*(one(b) for b in blocks))

    notes: list[str] = []
    unreachable: str | None = None
    for block, res in results:
        if not res.checked:
            unreachable = res.error
            continue
        if res.flagged:
            excerpt = block[:70] + ("..." if len(block) > 70 else "")
            notes.append(f'"{excerpt}" [{", ".join(res.findings)}]')

    if unreachable and not notes:
        return ScreenResult(checked=False, error=unreachable, blocks_screened=len(blocks))

    return ScreenResult(
        checked=True,
        flagged=bool(notes),
        findings=notes,
        blocks_screened=len(blocks),
    )


async def screen(text: str, *, project: str | None = None) -> ScreenResult:
    """Screen one passage. Prefer `screen_page` unless you have a single block."""
    if not ARMOR_ENABLED:
        return ScreenResult(checked=False, error="disabled (MODEL_ARMOR_ENABLED)")

    project = project or os.getenv("GOOGLE_CLOUD_PROJECT")
    if not project:
        return ScreenResult(checked=False, error="GOOGLE_CLOUD_PROJECT is not set")
    if not text or not text.strip():
        return ScreenResult(checked=True, flagged=False)

    try:
        import google.auth
        import google.auth.transport.requests
        import httpx

        credentials, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        credentials.refresh(google.auth.transport.requests.Request())

        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            response = await client.post(
                _endpoint(project),
                headers={
                    "Authorization": f"Bearer {credentials.token}",
                    "Content-Type": "application/json",
                },
                json={"userPromptData": {"text": text[:MAX_SCREEN_CHARS]}},
            )
        if response.status_code != 200:
            return ScreenResult(
                checked=False,
                error=f"HTTP {response.status_code}: {response.text[:160]}",
            )

        flagged, notes = _collect(response.json())
        return ScreenResult(checked=True, flagged=flagged, findings=notes)

    except Exception as exc:  # noqa: BLE001
        return ScreenResult(checked=False, error=f"{type(exc).__name__}: {exc}")
