"""Agent 4 — TriageAgent. Orders findings and rewrites impact into plain words.

Two jobs, and the second matters more than the first.

Ordering: a page with 33 identical `image-alt` failures on decorative borders
and one unlabelled payment form should not lead with the borders. Severity
alone cannot see that; it ranks all 33 above nothing.

Language: axe says "Images must have alternate text". That is a rule, not a
consequence. `userImpact` should say what happens to a person, because the
report is read by someone deciding whether to spend a developer's afternoon on
it, and "a screen reader user cannot tell what the price chart shows" argues
for itself in a way a rule name never does.

Batched into one call rather than one per finding: ranking is inherently
comparative, and the model cannot order a list it only sees one item at a time.
That also makes it far cheaper than the Remediator.

Falls back to the deterministic sort in `rule_auditor.fallback_triage` on any
failure. The pipeline must never lose findings because a model call failed.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass

from . import prompts, rule_auditor
from .models import Finding

DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.7-flash")
VERTEX_LOCATION = os.getenv("VERTEX_LOCATION", "global")

# Ranking needs the whole set, but the whole set can be 79 items. Beyond this
# the prompt gets long and the ordering gets no better.
MAX_FINDINGS_PER_CALL = 80


@dataclass
class TriageOutcome:
    findings: list[Finding]
    model_used: bool
    reason: str | None = None


def _client():
    from google import genai

    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    if not project:
        raise RuntimeError("GOOGLE_CLOUD_PROJECT is not set")
    return genai.Client(vertexai=True, project=project, location=VERTEX_LOCATION)


def _digest(findings: list[Finding]) -> str:
    """Compact view of the findings. Deliberately excludes page HTML.

    The model is ordering and describing, not fixing, so it does not need the
    markup — and not sending it removes a whole class of injection surface.
    """
    lines = []
    for f in findings:
        lines.append(
            f"- id: {f.findingId}\n"
            f"  rule: {f.category}\n"
            f"  wcag: {f.wcagCriterion}\n"
            f"  severity: {f.severity.value}\n"
            f"  selector: {f.selector}\n"
            f"  currentImpact: {f.userImpact}"
        )
    return "\n".join(lines)


async def triage(
    findings: list[Finding],
    *,
    client=None,
    model: str = DEFAULT_MODEL,
    page_url: str = "",
    spread_rules: bool = True,
) -> TriageOutcome:
    """Rank and rewrite. Never drops or invents a finding."""
    if not findings:
        return TriageOutcome(findings, False, "nothing to triage")

    from google.genai import types

    subset = findings[:MAX_FINDINGS_PER_CALL]
    by_id = {f.findingId: f for f in findings}

    try:
        client = client or _client()
        response = await client.aio.models.generate_content(
            model=model,
            contents=prompts.build_triage_user_prompt(
                page_url=page_url, digest=_digest(subset)
            ),
            config=types.GenerateContentConfig(
                system_instruction=prompts.TRIAGE_SYSTEM,
                temperature=0.0,
                response_mime_type="application/json",
                response_schema=prompts.TRIAGE_RESPONSE_SCHEMA,
                max_output_tokens=8192,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(
                    disable=True
                ),
            ),
        )
        data = json.loads((response.text or "").strip())
    except Exception as exc:  # noqa: BLE001
        return TriageOutcome(
            rule_auditor.fallback_triage(findings),
            False,
            f"model triage failed, used the deterministic sort: {type(exc).__name__}",
        )

    ranked_ids: list[str] = []
    for item in data.get("ranked", []):
        fid = item.get("findingId")
        finding = by_id.get(fid)
        if finding is None:
            # A model that invents an id gets ignored rather than trusted.
            continue
        if fid in ranked_ids:
            continue

        impact = (item.get("userImpact") or "").strip()
        # Only accept a rewrite that is actually a sentence about a person.
        # An empty or trivially short one keeps the deterministic fallback text.
        if len(impact) >= 25:
            finding.userImpact = impact
        ranked_ids.append(fid)

    if not ranked_ids:
        return TriageOutcome(
            rule_auditor.fallback_triage(findings),
            False,
            "model returned no usable ranking, used the deterministic sort",
        )

    # Anything the model omitted keeps its place behind what it ranked. A
    # finding must never disappear because it was left out of a response.
    ordered = [by_id[i] for i in ranked_ids]
    ordered += [f for f in findings if f.findingId not in set(ranked_ids)]

    if spread_rules:
        ordered = diversify(ordered)
    else:
        for rank, finding in enumerate(ordered, start=1):
            finding.triageRank = rank

    return TriageOutcome(ordered, True, None)


def diversify(findings: list[Finding]) -> list[Finding]:
    """Reorder so the top of the list shows one example of each problem type.

    The model ranks by harm, and it is right that thirty-eight contrast
    failures are all serious. But a list whose first ten rows are the same rule
    is a bad report: a developer fixing `color-contrast` fixes all thirty-eight
    in one pass, so showing thirty-eight rows before the first unlabelled form
    control buries the second problem behind the first.

    This does not re-judge anything. Findings are bucketed by rule in the
    model's own order, buckets are ordered by their best-ranked member, and
    then emitted round-robin. Within any one rule the model's harm ordering is
    preserved exactly. What changes is presentation order, not assessment.

    `triageRank` after this call means "order to show", not "severity". The
    severity field still carries severity.
    """
    if not findings:
        return findings

    buckets: dict[str, list[Finding]] = {}
    for finding in findings:
        buckets.setdefault(finding.category, []).append(finding)

    # A bucket's position is set by its strongest finding, so a rule with one
    # severe instance is not pushed behind a rule with many mild ones.
    order = sorted(buckets, key=lambda c: findings.index(buckets[c][0]))

    result: list[Finding] = []
    round_index = 0
    while len(result) < len(findings):
        emitted = False
        for category in order:
            bucket = buckets[category]
            if round_index < len(bucket):
                result.append(bucket[round_index])
                emitted = True
        if not emitted:
            break
        round_index += 1

    for rank, finding in enumerate(result, start=1):
        finding.triageRank = rank
    return result
