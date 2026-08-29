"""Agent 6 — Remediator. One instance per finding. Drafts the patch.

This is the first place a model's output can reach a user, so everything the
prompt asks for is checked again here. A prompt asks; this module decides.

What it never does:
  - set `verified` — only the Verifier may, and only after re-running axe
  - accept a patch identical to the original
  - accept `requiresHumanInput` without guidance
  - accept a rewrite so large it is no longer a minimal, reviewable diff

A rejected patch is not a lost finding. The finding stays at `detected` with
the reason recorded, which is honest: we found the violation, we did not draft
a fix we trust.

Agent 5 (RemediationFanOut) is `remediate_all` — bounded concurrency rather
than an unbounded gather, because each call costs money and quota.
"""

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass, field

from . import prompts
from .models import DEFAULT_MIN_CONFIDENCE, Finding, Framework

DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Each in-flight request is a Chromium-free but quota-consuming call. Bounded
# so a 79-finding page cannot open 79 simultaneous connections.
DEFAULT_CONCURRENCY = int(os.getenv("REMEDIATOR_CONCURRENCY", "6"))

# A minimal fix is a small edit. A response several times longer than the
# original is the model rewriting the component, which is not what we asked
# for and not a diff anyone will merge.
MAX_GROWTH_FACTOR = 4.0
MAX_GROWTH_SLACK = 400


@dataclass
class PatchOutcome:
    """What happened to one finding. Rejections are data, not silence."""

    finding: Finding
    drafted: bool
    reason: str | None = None


@dataclass
class RemediationReport:
    outcomes: list[PatchOutcome] = field(default_factory=list)

    @property
    def drafted(self) -> list[Finding]:
        return [o.finding for o in self.outcomes if o.drafted]

    @property
    def rejected(self) -> list[PatchOutcome]:
        return [o for o in self.outcomes if not o.drafted]

    def summary(self) -> str:
        return f"drafted {len(self.drafted)}, rejected {len(self.rejected)}"


def _client():
    """Vertex AI client. Imported lazily so stage 1 runs with no GCP deps."""
    from google import genai

    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
    if not project:
        raise RuntimeError(
            "GOOGLE_CLOUD_PROJECT is not set — the Remediator needs Vertex AI. "
            "Stage 1 (capture, audit, verify) still runs without it."
        )
    return genai.Client(vertexai=True, project=project, location=location)


def _strip_fences(text: str) -> str:
    """Defensive. The schema should prevent fences; models sometimes add them."""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1] if "\n" in t else t
        if t.endswith("```"):
            t = t[: -3]
        t = t.removeprefix("json").strip()
    return t


def _validate(
    finding: Finding, data: dict, min_confidence: float
) -> tuple[bool, str | None]:
    """Every rule the prompt asks for, checked again here.

    Returns (accepted, rejection_reason).
    """
    patched = (data.get("patchedCode") or "").strip()
    original = (finding.currentCode or "").strip()

    if not patched:
        return False, "model returned an empty patch"

    if patched == original:
        return False, "patch is identical to the original — nothing was fixed"

    confidence = float(data.get("confidence") or 0.0)
    # The contract defines confidence as 0.0-1.0. A live response came back
    # with 5.0, which we cannot interpret — it may be 5 out of 10, or a
    # mistake. Guessing at the scale would be inventing certainty we do not
    # have, so the patch is refused rather than rescaled.
    if not 0.0 <= confidence <= 1.0:
        return False, (
            f"confidence {confidence} is outside the 0.0-1.0 range the "
            "contract defines — cannot interpret it"
        )
    if confidence < min_confidence:
        return False, f"confidence {confidence:.2f} below the {min_confidence} floor"

    requires_human = bool(data.get("requiresHumanInput"))
    guidance = (data.get("humanGuidance") or "").strip()
    if requires_human and not guidance:
        # Hard rule 5. Without guidance the UI renders a placeholder as though
        # it were a finished fix, which is the exact failure we guard against.
        return False, "requiresHumanInput set without humanGuidance"
    if not requires_human and guidance:
        return False, "humanGuidance supplied without requiresHumanInput"

    budget = len(original) * MAX_GROWTH_FACTOR + MAX_GROWTH_SLACK
    if len(patched) > budget:
        return False, (
            f"patch is {len(patched)} chars against a {len(original)} char "
            "original — not a minimal change"
        )

    return True, None


async def remediate_one(
    finding: Finding,
    *,
    client=None,
    model: str = DEFAULT_MODEL,
    context: str | None = None,
    min_confidence: float | None = None,
) -> PatchOutcome:
    """Draft a patch for one finding.

    On success the finding moves to `patched` via `mark_patched`. It is not
    verified — the Verifier decides that, and it may still reject this.
    """
    from google.genai import types

    if min_confidence is None:
        min_confidence = float(os.getenv("MIN_CONFIDENCE", str(DEFAULT_MIN_CONFIDENCE)))
    client = client or _client()

    user_prompt = prompts.build_remediator_user_prompt(
        category=finding.category,
        wcag=finding.wcagCriterion,
        severity=finding.severity.value,
        user_impact=finding.userImpact,
        framework=finding.framework.value,
        current_code=finding.currentCode,
        context=context,
    )

    try:
        response = await client.aio.models.generate_content(
            model=model,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=prompts.REMEDIATOR_SYSTEM,
                # Deterministic. A fix should not vary between runs, and the
                # demo numbers must be reproducible.
                temperature=0.0,
                response_mime_type="application/json",
                response_schema=prompts.REMEDIATOR_RESPONSE_SCHEMA,
                max_output_tokens=2048,
                # We pass no tools; disabling this silences an advisory
                # warning and removes a code path we never want taken.
                automatic_function_calling=types.AutomaticFunctionCallingConfig(
                    disable=True
                ),
            ),
        )
    except Exception as exc:  # noqa: BLE001
        return PatchOutcome(finding, False, f"model call failed: {type(exc).__name__}: {exc}")

    raw = (response.text or "").strip()
    if not raw:
        return PatchOutcome(finding, False, "model returned an empty response")

    try:
        data = json.loads(_strip_fences(raw))
    except ValueError as exc:
        return PatchOutcome(finding, False, f"response was not valid JSON: {exc}")

    accepted, reason = _validate(finding, data, min_confidence)
    if not accepted:
        return PatchOutcome(finding, False, reason)

    finding.mark_patched(
        data["patchedCode"].strip(),
        (data.get("changeSummary") or "").strip() or None,
    )
    finding.requiresHumanInput = bool(data.get("requiresHumanInput"))
    finding.humanGuidance = (data.get("humanGuidance") or "").strip() or None
    finding.confidence = float(data["confidence"])

    framework = (data.get("framework") or "").lower()
    if framework in {f.value for f in Framework}:
        finding.framework = Framework(framework)

    return PatchOutcome(finding, True, None)


async def remediate_all(
    findings: list[Finding],
    *,
    model: str = DEFAULT_MODEL,
    concurrency: int = DEFAULT_CONCURRENCY,
    context_by_id: dict[str, str] | None = None,
    limit: int | None = None,
) -> RemediationReport:
    """Agent 5 — fan out one Remediator per finding, with a concurrency bound.

    `limit` caps how many findings we pay to remediate. A page with 79
    violations does not need 79 model calls to make the point, and Playwright
    plus Gemini on a hackathon budget is a real constraint. Findings beyond the
    cap stay at `detected` — reported, not hidden.
    """
    client = _client()
    context_by_id = context_by_id or {}

    targets = findings if limit is None else findings[:limit]
    gate = asyncio.Semaphore(concurrency)

    async def run(f: Finding) -> PatchOutcome:
        async with gate:
            return await remediate_one(
                f,
                client=client,
                model=model,
                context=context_by_id.get(f.findingId),
            )

    outcomes = list(await asyncio.gather(*(run(f) for f in targets)))

    for skipped in findings[len(targets) :]:
        outcomes.append(
            PatchOutcome(skipped, False, f"beyond the remediation cap of {limit}")
        )

    return RemediationReport(outcomes=outcomes)
