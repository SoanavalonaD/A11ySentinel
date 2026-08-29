"""A11ySentinel as an ADK agent graph.

Run the Dev UI from `pipeline/`:

    adk web adk_apps

Then pick `a11ysentinel`, and send any message — or a URL to override the
default target. The UI shows the agent tree, streams each Event as it is
emitted, and lets you inspect session state after every step.

Or headless:

    adk run adk_apps/a11ysentinel

What is genuinely an ADK agent here
-----------------------------------

Agents 1, 2 and 7 are ADK constructs, and they are the ones where that buys
something:

  1 RootOrchestrator   SequentialAgent  — composition, state, event streaming
  2 RuleAuditor        BaseAgent        — axe-core, deterministic
  7 Verifier           BaseAgent        — axe re-run, deterministic

Agents 4, 5 and 6 are wrapped as stages that call the existing
implementations. That is deliberate. `remediate_all` already does bounded
concurrency, per-finding validation and rejection reporting; re-expressing it
as a `ParallelAgent` of `LlmAgent`s the day before submission would risk
working, tested code to gain a class name. The stage boundaries are real
either way, and the Dev UI shows all four.

Four things to know about ADK
-----------------------------

1. Every agent is a `BaseAgent`. `SequentialAgent`, `ParallelAgent` and
   `LlmAgent` are subclasses; you compose by nesting.

2. A custom agent overrides `_run_async_impl(ctx)` and **yields Events**. It is
   an async generator, not a function that returns.

3. **State must travel in `Event.actions.state_delta`.** Assigning to
   `ctx.session.state` appears to work — the next agent shares the live dict —
   and then silently vanishes when anything reads the session back. This cost
   a debugging round: the first version logged 21 violations and reported None
   in final state.

4. A `Runner` owns the session and drives everything. You never call an agent
   directly.

Note: `SequentialAgent` emits a DeprecationWarning in ADK 2.8 in favour of
`Workflow`. It still works and is what the agent register specifies; changing
the orchestrator type the day before submission is not a trade worth making.
"""

from __future__ import annotations

import os
from typing import AsyncGenerator

from google.adk.agents import BaseAgent, SequentialAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event, EventActions
from google.genai import types

from a11ysentinel import capture as capture_mod
from a11ysentinel import jurisdiction as jurisdiction_mod
from a11ysentinel import rule_auditor, verifier
from a11ysentinel.models import Finding, FindingStatus

# Overridable from the Dev UI by sending a URL as the message.
DEFAULT_TARGET = os.getenv(
    "ADK_DEFAULT_TARGET",
    "https://a11ysentinel-pipeline-708226575684.us-central1.run.app"
    "/demo/index.html",
)

REMEDIATION_LIMIT = int(os.getenv("REMEDIATION_LIMIT", "12"))


def event(author: str, text: str, **state: object) -> Event:
    """One Event: a line of progress, plus any state it wants to persist.

    `actions` never takes None — pass an EventActions instance always, even an
    empty one.
    """
    return Event(
        author=author,
        content=types.Content(role="model", parts=[types.Part(text=text)]),
        actions=EventActions(state_delta=state),
    )


def _target_from(ctx: InvocationContext) -> str:
    """Take a URL typed into the Dev UI, otherwise the configured default."""
    existing = ctx.session.state.get("target_url")
    if existing:
        return str(existing)

    content = getattr(ctx, "user_content", None)
    if content and getattr(content, "parts", None):
        for part in content.parts:
            text = (getattr(part, "text", "") or "").strip()
            if text.startswith(("http://", "https://")):
                return text
    return DEFAULT_TARGET


class RuleAuditorAgent(BaseAgent):
    """Agent 2 — axe-core against the captured DOM. No model.

    This is the ground truth the whole project rests on, which is exactly why
    it is deterministic: the before/after numbers must be reproducible.
    """

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        url = _target_from(ctx)
        yield event(self.name, f"capturing {url}", target_url=url)

        async with capture_mod.BrowserSession() as browser:
            page_capture = await capture_mod.capture_page(
                browser, url, screenshot=False
            )
            context = await browser.new_context(viewport=capture_mod.VIEWPORT)
            try:
                page = await context.new_page()
                await page.set_content(
                    page_capture.html, wait_until="domcontentloaded"
                )
                raw = await rule_auditor.run_axe(page)
                before = rule_auditor.count_violations(raw)

                # WCAG is what we measured; this only names the regional
                # framework to show beside it.
                regional = jurisdiction_mod.detect(
                    page_capture.url,
                    lang=page_capture.language,
                    html=page_capture.html,
                )
                findings, discards = await rule_auditor.normalise(
                    page,
                    raw,
                    page_url=page_capture.url,
                    framework=page_capture.framework,
                    regional=regional,
                )
            finally:
                await context.close()

        yield event(
            self.name,
            f"{before} violations, {len(findings)} findings on targeted rules. "
            f"{regional.explain()}",
            page_html=page_capture.html,
            page_language=page_capture.language,
            violations_before=before,
            # Models cannot cross the state boundary; a session service has to
            # serialise what it stores.
            findings=[f.to_firestore() for f in findings],
            regional_framework=regional.framework,
            discards=discards,
        )


class TriageStage(BaseAgent):
    """Agent 4 — ranks by harm and rewrites impact into plain language.

    Falls back to the deterministic sort on any failure, so a model outage
    reorders the report but never loses it.
    """

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        raw = ctx.session.state.get("findings") or []
        if not raw:
            yield event(self.name, "nothing to triage")
            return

        findings = [Finding.model_validate(f) for f in raw]

        from a11ysentinel import triage as triage_mod

        outcome = await triage_mod.triage(
            findings, page_url=ctx.session.state.get("target_url", "")
        )
        note = "model triage" if outcome.model_used else "deterministic sort"
        if outcome.reason:
            note += f" ({outcome.reason})"

        yield event(
            self.name,
            f"{len(outcome.findings)} findings ordered by user impact — {note}",
            findings=[f.to_firestore() for f in outcome.findings],
        )


class RemediationStage(BaseAgent):
    """Agents 5 and 6 — fan out one Remediator per finding.

    Calls `remediate_all`, which already bounds concurrency, validates every
    response and reports rejections. Nothing here sets `verified`; only the
    Verifier may.
    """

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        raw = ctx.session.state.get("findings") or []
        if not raw:
            yield event(self.name, "nothing to remediate")
            return

        findings = [Finding.model_validate(f) for f in raw]

        from a11ysentinel import remediator

        report = await remediator.remediate_all(
            findings,
            limit=REMEDIATION_LIMIT,
            language=ctx.session.state.get("page_language"),
        )

        yield event(
            self.name,
            f"patches drafted for {len(report.drafted)} findings, "
            f"{len(report.rejected)} not attempted or refused",
            findings=[f.to_firestore() for f in findings],
        )


class VerifierAgent(BaseAgent):
    """Agent 7 — applies each patch, re-runs axe, and judges the result.

    Hard rule 3: nothing unverified reaches the proxy or the report. This is
    the only place `verified` is set. Anything whose patch fails is reverted to
    `detected`, so the violation is still reported honestly rather than
    disappearing because our own fix attempt failed.
    """

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        raw = ctx.session.state.get("findings") or []
        html = ctx.session.state.get("page_html")
        if not html:
            yield event(self.name, "no captured DOM in state; cannot verify")
            return

        findings = [Finding.model_validate(f) for f in raw]

        async with capture_mod.BrowserSession() as browser:
            result = await verifier.verify_patches(
                browser,
                page_url=ctx.session.state.get("target_url", ""),
                html=html,
                findings=findings,
            )

        for finding in findings:
            if finding.status is FindingStatus.PATCHED:
                finding.revert_to_detected()

        verified = sum(1 for f in findings if f.status is FindingStatus.VERIFIED)
        needs_human = sum(
            1
            for f in findings
            if f.status is FindingStatus.VERIFIED and f.requiresHumanInput
        )

        yield event(
            self.name,
            f"{result.violations_before} -> {result.violations_after} "
            f"({verified} fixes verified, {needs_human} need a human). "
            "Nothing unverified leaves this step.",
            violations_after=result.violations_after,
            verified_count=verified,
            findings=[f.to_firestore() for f in findings],
        )


# Agent 1. Composition is configuration, not logic — which is the point.
root_agent = SequentialAgent(
    name="RootOrchestrator",
    description=(
        "Finds WCAG 2.1 AA violations on a page, prioritises them by user "
        "impact, drafts fixes, and verifies each one by re-running the rule "
        "engine. Does not make a site compliant; a human approves every change."
    ),
    sub_agents=[
        RuleAuditorAgent(
            name="RuleAuditor",
            description="Runs axe-core against the captured DOM. Deterministic.",
        ),
        TriageStage(
            name="TriageAgent",
            description="Orders findings by harm and rewrites impact in plain language.",
        ),
        RemediationStage(
            name="RemediationFanOut",
            description="Drafts a patch per finding, in parallel, with a budget cap.",
        ),
        VerifierAgent(
            name="Verifier",
            description="Re-runs axe on the patched DOM. The only step that sets verified.",
        ),
    ],
)
