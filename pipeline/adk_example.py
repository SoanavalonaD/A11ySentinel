"""A minimal, runnable ADK wiring for the A11ySentinel pipeline.

Run it:  python adk_example.py

This exists to answer "how do we actually use ADK", with code that runs rather
than an explanation. It needs no Vertex AI credentials, because the agents it
wires up are the deterministic ones — which is most of ours.

The four ideas you need
-----------------------

1. Every agent is a `BaseAgent`. `SequentialAgent`, `ParallelAgent` and
   `LlmAgent` are subclasses. You compose them by nesting.

2. A custom agent overrides `_run_async_impl(ctx)` and **yields Events**. It is
   an async generator, not a function that returns. Yielding an Event is how
   the agent reports progress; the framework streams those to the caller.

3. Agents talk through `ctx.session.state`, a plain dict. One writes a key,
   the next reads it. `LlmAgent(output_key="x")` writes its text output to
   `state["x"]` automatically. This is the whole data-passing model.

4. You never call an agent directly. A `Runner` owns a session and drives it.

Mapping to our seven agents
---------------------------

  1 RootOrchestrator   SequentialAgent(sub_agents=[2, 4, 5, 7])
  2 RuleAuditor        BaseAgent  — axe, deterministic          (shown below)
  3 VisualAuditor      LlmAgent   — needs Gemini
  4 TriageAgent        LlmAgent   — needs Gemini
  5 RemediationFanOut  ParallelAgent(sub_agents=[6, 6, 6, ...])
  6 Remediator         LlmAgent   — one per finding
  7 Verifier           BaseAgent  — axe re-run, deterministic   (shown below)

Four of the seven are deterministic, so ADK here is mostly orchestration, not
model plumbing. That is a feature: the numbers stay reproducible.
"""

from __future__ import annotations

import asyncio
from typing import AsyncGenerator

from google.adk.agents import BaseAgent, SequentialAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event, EventActions
from google.adk.runners import InMemoryRunner
from google.genai import types

from a11ysentinel import capture as capture_mod
from a11ysentinel import jurisdiction as jurisdiction_mod
from a11ysentinel import rule_auditor, verifier
from a11ysentinel.models import Finding

APP_NAME = "a11ysentinel"


def _say(author: str, text: str, **state) -> Event:
    """An Event carrying a human-readable line, and optionally state changes.

    Events are the unit of progress in ADK. Anything you yield is streamed to
    the Runner, which is how a caller shows live status — the dashboard's
    "capturing / auditing / verifying" comes from exactly this.

    THE GOTCHA: assigning to `ctx.session.state` inside an agent does not
    persist. The session service only applies state changes it sees in an
    Event's `actions.state_delta`. Mutating the dict directly works for the
    next agent in the same run (they share the live object) and then silently
    vanishes when anything reads the session back. Pass state through here.
    """
    return Event(
        author=author,
        content=types.Content(role="model", parts=[types.Part(text=text)]),
        # Always an EventActions instance — the field does not accept None.
        actions=EventActions(state_delta=state),
    )


class RuleAuditorAgent(BaseAgent):
    """Agent 2. Deterministic: Playwright + axe-core, no model.

    Reads  state["target_url"]
    Writes state["findings"], state["violations_before"], state["page_html"]
    """

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        url = ctx.session.state.get("target_url")
        if not url:
            yield _say(self.name, "no target_url in state; nothing to audit")
            return

        yield _say(self.name, f"capturing {url}")

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

                regional = jurisdiction_mod.detect(
                    page_capture.url,
                    lang=page_capture.language,
                    html=page_capture.html,
                )
                findings, _ = await rule_auditor.normalise(
                    page,
                    raw,
                    page_url=page_capture.url,
                    framework=page_capture.framework,
                    regional=regional,
                )
            finally:
                await context.close()

        findings = rule_auditor.fallback_triage(findings)

        # State travels in the Event, not by assigning to ctx.session.state.
        # Findings are model objects, so they are dumped to plain dicts — a
        # session service has to be able to serialise whatever it stores.
        yield _say(
            self.name,
            f"{before} violations, {len(findings)} findings. "
            f"{regional.explain()}",
            page_html=page_capture.html,
            violations_before=before,
            findings=[f.to_firestore() for f in findings],
            regional_framework=regional.framework,
        )


class VerifierAgent(BaseAgent):
    """Agent 7. Deterministic: re-runs axe on the patched DOM.

    Reads  state["findings"], state["page_html"]
    Writes state["violations_after"]

    With no Remediator in this example there are no patches, so before equals
    after. That is the honest stage 1 result, not a broken pipeline.
    """

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        # Read back what the previous agent put in state, and rebuild the
        # models from the plain dicts it stored.
        raw_findings = ctx.session.state.get("findings") or []
        findings = [Finding.model_validate(f) for f in raw_findings]
        html = ctx.session.state.get("page_html")
        if not html:
            yield _say(self.name, "no captured DOM in state; cannot verify")
            return

        async with capture_mod.BrowserSession() as browser:
            result = await verifier.verify_patches(
                browser,
                page_url=ctx.session.state.get("target_url", ""),
                html=html,
                findings=findings,
            )

        drafted = sum(1 for f in findings if f.patchedCode)
        yield _say(
            self.name,
            f"{result.violations_before} -> {result.violations_after} "
            f"({drafted} patches to check)",
            violations_after=result.violations_after,
        )


# Agent 1. Composition is the whole point: this is configuration, not logic.
# Agents 4 and 5 slot into sub_agents in this order without touching anything
# else.
root_agent = SequentialAgent(
    name="RootOrchestrator",
    description="Audits a page for WCAG 2.1 AA violations and verifies fixes.",
    sub_agents=[
        RuleAuditorAgent(
            name="RuleAuditor",
            description="Runs axe-core against the captured DOM.",
        ),
        VerifierAgent(
            name="Verifier",
            description="Re-runs axe on the patched DOM to confirm each fix.",
        ),
    ],
)


async def main() -> None:
    target = (
        "https://a11ysentinel-pipeline-708226575684.us-central1.run.app"
        "/demo/index.html"
    )

    # A Runner owns sessions and drives the agent. InMemoryRunner is the local
    # one; in Cloud Run you would use a persistent session service instead.
    runner = InMemoryRunner(agent=root_agent, app_name=APP_NAME)

    session = await runner.session_service.create_session(
        app_name=APP_NAME,
        user_id="demo",
        state={"target_url": target},
    )

    print(f"\n  target: {target}\n")

    async for event in runner.run_async(
        user_id="demo",
        session_id=session.id,
        new_message=types.Content(
            role="user", parts=[types.Part(text="audit this page")]
        ),
    ):
        if event.content and event.content.parts:
            for part in event.content.parts:
                if part.text:
                    print(f"  [{event.author}] {part.text}")

    final = await runner.session_service.get_session(
        app_name=APP_NAME, user_id="demo", session_id=session.id
    )
    state = final.state
    print()
    print(f"  violations : {state.get('violations_before')} -> {state.get('violations_after')}")
    print(f"  findings   : {len(state.get('findings') or [])}")
    print(f"  framework  : {state.get('regional_framework') or '(none inferred)'}")
    print()


if __name__ == "__main__":
    asyncio.run(main())
