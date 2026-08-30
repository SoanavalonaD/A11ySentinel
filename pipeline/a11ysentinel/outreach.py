"""Agent 8 — OutreachDrafter. Writes the narrative part of the audit email.

Until this existed the email was a template literal: every recipient got the
same prose with four numbers swapped in. That is defensible but wasteful — the
pipeline already produces `userImpact`, a plain-language sentence about what a
real person cannot do, and burying that under "47 → 6" throws away the one
thing in the report that argues for itself.

**This agent writes prose for an unsolicited message, which makes it the most
dangerous surface in the product.** Everywhere else a model is wrong in
private and a human sees it in a dashboard first. Here a model is wrong in
someone else's inbox, about their legal exposure, under our name. The overlay
industry's reputational damage — and accessiBe's $1M FTC settlement — came
from exactly this: automated accessibility claims that outran what the tool
had measured.

So the model is given the smallest possible job and the narrowest possible
output:

  it writes    an opening, up to three consequence sentences, a closing
  it never     writes a number, a link, the metrics table, the claim-discipline
               notice, the opt-out footer, or the subject line

Everything it cannot write is assembled around it from a fixed template, so
the parts of the email that carry a claim are not generated at all.

Then `screen()` runs over what came back. That check is deterministic, it is
in code rather than in the prompt, and it is the actual control — a prompt
asks, and this decides. A draft mentioning compliance, liability, a lawsuit, a
deadline or a guarantee is discarded whole. Not edited, not patched up:
discarded, because a model that reached for "you may be liable" once will have
reached for the adjacent idea elsewhere in the same draft.

On any failure — model error, malformed response, an ungrounded finding id, a
banned phrase — this returns `drafted=False` and the caller falls back to the
static template, which is safe by construction. Same shape as `triage`
reverting to the deterministic sort. The email always sends; the question is
only whether it is the interesting version.

Nothing here sends anything. The human approval gate in the dashboard is
unchanged and still the only thing that can put this in front of a person.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field

from . import prompts
from .models import Finding

DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.7-flash")
VERTEX_LOCATION = os.getenv("VERTEX_LOCATION", "global")

# Three is a limit on the reader's attention, not on the model's. An email
# listing eight problems is a list; an email naming three is a point.
MAX_HIGHLIGHTS = 3

# A highlight shorter than this is a fragment, not a consequence — same floor
# triage uses before it will accept a rewritten userImpact.
MIN_SENTENCE_CHARS = 25
MAX_SENTENCE_CHARS = 320
MAX_OPENING_CHARS = 500
MAX_CLOSING_CHARS = 300


class ClaimDisciplineError(Exception):
    """A draft asserted something the audit cannot support."""


# The agent writes in the audited page's language, so the screen has to read
# that language too — and it does not read every language. A screen that
# silently passes everything it cannot read is worse than no screen, because
# it still looks like a control. So coverage gates generation: a page in an
# unscreened language gets the static template rather than an unscreened draft.
#
# English and French because those are the languages this project audits —
# RGAA is the named regional framework and the demo site is French-language.
# Adding a language means adding its patterns below AND its code here.
SCREENED_LANGUAGES = frozenset({"en", "fr"})


def language_is_screened(language: str | None) -> bool:
    """Whether `screen()` can actually read this language.

    None is covered: the prompt tells the model to write in English when the
    page language is unknown. A regional tag matches on its primary subtag, so
    `fr-CA` and `en-GB` resolve to `fr` and `en`.
    """
    if not language:
        return True
    return language.strip().lower().split("-")[0] in SCREENED_LANGUAGES


# The control, stated once. Word-boundary anchored so ordinary words survive:
# "issue" must not trip `sue`, "ensure" must not trip `sue`, "define" must not
# trip `fined`.
#
# Bare "fine" is deliberately absent — it is too common in ordinary prose to
# ban, and "fined"/"fines" are the forms that carry the claim.
_BANNED: list[tuple[str, str]] = [
    (r"\bcomplian(t|ce)\b", "asserts compliance"),
    (r"\bnon-?complian(t|ce)\b", "asserts non-compliance"),
    (r"\bconform(s|ance|ant|ing)?\b", "asserts conformance"),
    (r"\bcertif(y|ied|ication)\b", "claims certification"),
    (r"\baccredit(ed|ation)\b", "claims accreditation"),
    (r"\bguarantee(s|d)?\b", "offers a guarantee"),
    (r"\bliab(le|ility)\b", "asserts liability"),
    (r"\blawsuit(s)?\b", "raises litigation"),
    (r"\blitigat(e|ion|ing)\b", "raises litigation"),
    (r"\bsue[sd]?\b|\bsuing\b", "raises litigation"),
    (r"\bprosecut(e|ed|ion)\b", "raises prosecution"),
    (r"\bpenalt(y|ies)\b", "raises a penalty"),
    (r"\bfined\b|\bfines\b", "raises a fine"),
    (r"\bdamages\b", "raises damages"),
    (r"\battorney(s)?\b|\blawyer(s)?\b", "raises legal counsel"),
    (r"\bcourt\b", "raises legal proceedings"),
    (r"\blegal(ly)?\b", "asserts a legal position"),
    (r"\bunlawful\b|\billegal\b", "asserts illegality"),
    (r"\bADA\b", "names a law"),
    (r"\bsection\s*508\b", "names a law"),
    (r"\bEuropean Accessibility Act\b|\bEAA\b", "names a law"),
    (r"\bat risk\b|\brisk of\b|\bexposed to\b|\bvulnerable to\b", "uses risk framing"),
    (r"\burgent(ly)?\b|\bimmediately\b|\bact now\b|\bact fast\b", "uses urgency"),
    (r"\bdeadline(s)?\b|\blimited time\b|\bdon'?t wait\b", "uses urgency"),
    (r"\bbefore it'?s too late\b|\bwarning\b", "uses fear framing"),
    (r"\bfully accessible\b|\bfully compliant\b", "overclaims the outcome"),
    (r"\b100\s*%|\ball (issues|problems) (are )?(resolved|fixed)\b", "overclaims the outcome"),
    (r"\bwe('ve| have)? fixed\b|\bwe repaired\b|\byour site is now\b", "claims the site is fixed"),
    (r"\beliminat(e|ed|es|ing)\b", "overclaims the outcome"),
    # -- French. The same claims, refused the same way. Accented and
    # unaccented spellings are both listed because both occur in practice.
    (r"\bconform(e|es|ité|ite|ement)\b", "asserts compliance [fr]"),
    (r"\bnon[- ]conform", "asserts non-compliance [fr]"),
    (r"\bresponsabilit[ée]\b", "asserts liability [fr]"),
    (r"\bpoursuite(s)?\b|\bpoursuivi(e|s)?\b", "raises litigation [fr]"),
    (r"\blitige(s)?\b|\bproc[èe]s\b", "raises litigation [fr]"),
    (r"\btribunal\b|\bavocat(e|s)?\b|\bjustice\b", "raises legal proceedings [fr]"),
    (r"\bamende(s)?\b|\bsanction(s)?\b|\bp[ée]nalit[ée]", "raises a penalty [fr]"),
    (r"\bill[ée]gal(e|es|aux)?\b|\billicite(s)?\b", "asserts illegality [fr]"),
    (r"\bjuridique(s)?\b|\bl[ée]gal(e|es|aux)?\b", "asserts a legal position [fr]"),
    (r"\bloi\b|\bl[ée]gislation\b|\br[ée]glementation\b", "names a law [fr]"),
    (r"\brisque(z|s|nt)?\b|\bexpos[ée](e|s)?\b", "uses risk framing [fr]"),
    (r"\burgent(e|s)?\b|\bimm[ée]diatement\b", "uses urgency [fr]"),
    (r"\bd[ée]lai(s)?\b|\bd[èe]s maintenant\b|\bau plus vite\b", "uses urgency [fr]"),
    (r"\bavant qu'?il ne soit trop tard\b|\bmise en garde\b", "uses fear framing [fr]"),
    (r"\bgaranti(e|es|t|r|ssons)?\b", "offers a guarantee [fr]"),
    (r"\bcertifi[ée](e|s)?\b|\bcertification\b|\baccr[ée]dit", "claims certification [fr]"),
    (r"\benti[èe]rement accessible\b|\btotalement accessible\b", "overclaims the outcome [fr]"),
    (
        r"\bnous avons corrig[ée]\b|\bvotre site est (maintenant|d[ée]sormais)\b",
        "claims the site is fixed [fr]",
    ),
    (
        r"\b(tous|toutes) les (probl[èe]mes|erreurs) (sont )?(corrig|r[ée]solu)",
        "overclaims the outcome [fr]",
    ),
]

_COMPILED = [(re.compile(p, re.IGNORECASE), why) for p, why in _BANNED]


@dataclass
class Highlight:
    findingId: str
    sentence: str

    def to_contract(self) -> dict:
        return {"findingId": self.findingId, "sentence": self.sentence}


@dataclass
class EmailDraft:
    """The narrative, or an honest statement that there isn't one.

    `drafted=False` is not an error the caller has to handle — it is the
    instruction to use the static template. The email still goes out.
    """

    drafted: bool = False
    model_used: bool = False
    opening: str | None = None
    highlights: list[Highlight] = field(default_factory=list)
    closing: str | None = None
    language: str | None = None
    reason: str | None = None
    screened: str | None = None

    def to_contract(self) -> dict:
        return {
            "drafted": self.drafted,
            "modelUsed": self.model_used,
            "opening": self.opening,
            "highlights": [h.to_contract() for h in self.highlights],
            "closing": self.closing,
            "language": self.language,
            "reason": self.reason,
            "screened": self.screened,
        }


def screen(text: str) -> list[str]:
    """Every claim-discipline rule this text breaks.

    Returns reasons rather than a bool so the trail can say what was wrong,
    and so a test can assert on the specific rule rather than on "it failed".
    """
    hits: list[str] = []
    for pattern, why in _COMPILED:
        match = pattern.search(text)
        if match:
            hits.append(f"{why} ({match.group(0).strip()!r})")
    return hits


def _client():
    from google import genai

    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    if not project:
        raise RuntimeError("GOOGLE_CLOUD_PROJECT is not set")
    return genai.Client(vertexai=True, project=project, location=VERTEX_LOCATION)


def _digest(findings: list[Finding]) -> str:
    """What the drafter sees. No markup, no code, no counts.

    Same reasoning as triage: the model is describing consequences, not fixing
    anything, so it never needs the page HTML — and not sending it removes a
    whole class of injection surface. It does not get the patch either, because
    a drafter that has seen a fix starts writing as though the fix shipped.
    """
    lines = []
    for f in findings:
        lines.append(
            f"- id: {f.findingId}\n"
            f"  severity: {f.severity.value}\n"
            f"  consequence: {f.userImpact}"
        )
    return "\n".join(lines)


def _shortlist(findings: list[Finding]) -> list[Finding]:
    """The findings worth naming: real violations, worst first.

    Ordered by `triageRank` where Agent 4 set one, so the email leads with what
    the triage agent judged most harmful rather than whatever came back first.
    """
    ranked = [f for f in findings if f.triageRank is not None]
    unranked = [f for f in findings if f.triageRank is None]
    ranked.sort(key=lambda f: f.triageRank or 0)
    return (ranked + unranked)[:MAX_HIGHLIGHTS]


async def draft(
    findings: list[Finding],
    *,
    target_url: str,
    language: str | None = None,
    client=None,
    model: str = DEFAULT_MODEL,
    screen_input: bool = True,
) -> EmailDraft:
    """Draft the narrative. Never raises — a failure means "use the template"."""
    shortlist = _shortlist(findings)
    if not shortlist:
        return EmailDraft(reason="no findings to write about")

    # Coverage gates generation. Drafting French prose and screening it with
    # English patterns would produce a draft that passed a check incapable of
    # reading it — the worst of both, because the log would say it was screened.
    if not language_is_screened(language):
        return EmailDraft(
            language=language,
            reason=(
                f"no claim-discipline screen for language {language!r}; "
                "using the static template rather than an unscreened draft"
            ),
        )

    from google.genai import types

    digest = _digest(shortlist)

    # The consequence sentences are derived from a third-party page, so they
    # are screened before they become part of a prompt. Model Armor fails
    # open by design (see armor.py) — a classifier outage must not stop an
    # audit — so a flag here is recorded and the draft continues to the
    # output gate, which is the check that actually decides.
    screened_note: str | None = None
    if screen_input:
        try:
            from . import armor

            result = await armor.screen(digest)
            screened_note = result.summary()
        except Exception as exc:  # noqa: BLE001
            screened_note = f"Model Armor not consulted: {type(exc).__name__}"

    try:
        client = client or _client()
        response = await client.aio.models.generate_content(
            model=model,
            contents=prompts.build_outreach_user_prompt(
                target_url=target_url, language=language, digest=digest
            ),
            config=types.GenerateContentConfig(
                system_instruction=prompts.OUTREACH_SYSTEM,
                temperature=0.2,
                response_mime_type="application/json",
                response_schema=prompts.OUTREACH_RESPONSE_SCHEMA,
                max_output_tokens=2048,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(
                    disable=True
                ),
            ),
        )
        data = json.loads((response.text or "").strip())
    except Exception as exc:  # noqa: BLE001
        return EmailDraft(
            reason=f"model draft failed, using the static template: {type(exc).__name__}",
            language=language,
            screened=screened_note,
        )

    return _validate(data, shortlist, language=language, screened=screened_note)


def _validate(
    data: dict,
    shortlist: list[Finding],
    *,
    language: str | None = None,
    screened: str | None = None,
) -> EmailDraft:
    """Turn a model response into a draft, or refuse it.

    Split out from `draft` so the guards are testable without a network call —
    these are the rules that matter, and they should be exercised by something
    cheaper than a live model.
    """
    reject = lambda why: EmailDraft(  # noqa: E731
        reason=why, language=language, screened=screened
    )

    opening = (data.get("opening") or "").strip()
    closing = (data.get("closing") or "").strip()

    if len(opening) < MIN_SENTENCE_CHARS:
        return reject("draft refused: opening missing or too short")
    if len(opening) > MAX_OPENING_CHARS or len(closing) > MAX_CLOSING_CHARS:
        return reject("draft refused: opening or closing over length")

    by_id = {f.findingId: f for f in shortlist}
    highlights: list[Highlight] = []
    seen: set[str] = set()

    for item in data.get("highlights", [])[:MAX_HIGHLIGHTS]:
        fid = (item.get("findingId") or "").strip()
        sentence = (item.get("sentence") or "").strip()

        # Hard rule 4. A highlight about a finding we did not supply is
        # describing something we never measured, which is the one thing this
        # email must never do.
        if fid not in by_id or fid in seen:
            continue
        if not (MIN_SENTENCE_CHARS <= len(sentence) <= MAX_SENTENCE_CHARS):
            continue

        seen.add(fid)
        highlights.append(Highlight(findingId=fid, sentence=sentence))

    if not highlights:
        return reject("draft refused: no highlight was grounded in a supplied finding")

    # The gate. Run over everything the model wrote, as one body — a phrase
    # split across the opening and a highlight still reads as one claim.
    body = "\n".join([opening, *(h.sentence for h in highlights), closing])
    breaches = screen(body)
    if breaches:
        return reject("draft refused, claim discipline: " + "; ".join(breaches))

    return EmailDraft(
        drafted=True,
        model_used=True,
        opening=opening,
        highlights=highlights,
        closing=closing or None,
        language=language,
        screened=screened,
    )
