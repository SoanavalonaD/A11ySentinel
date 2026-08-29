# A11ySentinel — Agent Register

Three different things in this project get called "agent". Keeping them separate stops the confusion.

- **Services** — Cloud Run deployments. Infrastructure, not agents.  
- **Agents** — ADK constructs inside the orchestrator. Seven of them.  
- **Tools** — plain Python functions agents call. Not agents.

---

## The 7 ADK Agents

| \# | Agent | ADK type | Input | Output | Gemini | Owner |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | `RootOrchestrator` | `SequentialAgent` | audit job message | completed audit record | no | **L** |
| 2 | `RuleAuditor` | Custom | DOM snapshot | axe violations → Finding\[\] | no | **L** |
| 3 | `VisualAuditor` | Custom (multimodal) | screenshot \+ trimmed DOM \+ axe findings | Finding\[\] (visual only) | **yes** | **L** |
| 4 | `TriageAgent` | `LlmAgent` | Finding\[\] | Finding\[\] scored \+ ordered | yes | **L** |
| 5 | `RemediationFanOut` | `ParallelAgent` | Finding\[\] | dispatches one Remediator per finding | no | **L** |
| 6 | `Remediator` | `LlmAgent` | 1 finding \+ DOM context \+ framework | patch JSON | **yes** | **L** |
| 7 | `Verifier` | Custom | patched DOM | verified flag \+ violationsAfter | no | **L** |

**L** \= Lewis (pipeline) · **P** \= Partner

**Status: all seven are built and deployed.** Agent 3 was the one open
handoff; it stayed with Lewis. It is a `BaseAgent` rather than an `LlmAgent`
because it needs to validate every returned selector against the live DOM
before a finding is kept, and that check has to sit in code.

### Detail per agent

**1\. RootOrchestrator** — Sequential wrapper running 2 → 3 → 4 → 5 → 7 in order. Owns audit state and writes status transitions to Firestore. Mostly configuration, little logic. Build first; everything hangs off it.

**2\. RuleAuditor** — Injects `axe.min.js` via Playwright `page.evaluate()`, normalises results into the Finding schema, maps WCAG criteria to RGAA equivalents. Deterministic, no model. **This is the ground truth the whole project rests on.**

**3\. VisualAuditor** — The multimodal differentiator, and your Best Multimodal UX claim. Prompt is written (see prompts doc). Most iteration-heavy agent: expect several rounds getting it to return only what axe missed, with valid selectors. **Must be followed by selector validation in code** — discard any finding whose selector matches zero DOM elements.

**4\. TriageAgent** — Scores severity × user impact × effort, rewrites `userImpact` into plain-language consequence. *Can ship as a plain sort by axe severity if time runs short.* Downgrade to a stub before cutting anything else.

**5\. RemediationFanOut** — ADK `ParallelAgent` dispatching a Remediator per finding. *Can ship as a sequential for-loop initially.* Parallelism is a performance and architecture point, not a correctness one.

**6\. Remediator** — One instance per finding. Generates the diff. Sets `requiresHumanInput: true` rather than inventing alt text. Prompt is written.

**7\. Verifier** — Applies each patch to the DOM snapshot, re-runs axe, confirms the violation is gone and nothing new appeared. Sets `verified`. **Nothing unverified reaches the proxy or the report.** This produces the 47 → 6 number that is the centrepiece of the demo.

---

## Ship order

Build in this sequence. Each stage is demoable on its own, so if you run out of time you still have something that works.

| Stage | Agents | What you can demo |
| :---- | :---- | :---- |
| 1 | 1, 2, 7 | Real violation counts, before/after — **no Gemini needed at all** |
| 2 | \+ 6 | Real code patches, proxy works |
| 3 | \+ 3 | Multimodal findings axe cannot catch |
| 4 | \+ 4, 5 | Prioritised output, true parallelism |

Stage 1 is your floor. If everything else fails, you still have a deployed agent producing verifiable numbers on Google Cloud.

---

## Supporting pieces (not agents)

**Tools** — plain functions: `crawl_site`, `capture_page`, `run_axe`, `validate_selector`, `write_finding`

**Cloud Run services**

| Service | Owner |
| :---- | :---- |
| Intake (URL submission \+ Pub/Sub publish) | L |
| Capture Worker (Cloud Run Job, Playwright) | L |
| Proxy (live patched preview) | **P** |
| Dashboard (findings UI) | **P** |

---

## Honest note on load balance

All seven agents sit in Lewis's workstream. That is deliberate: they share ADK plumbing and a runtime, and splitting them across two people in two languages costs more coordination than it saves over two days.

To balance, the partner owns everything else outright:

- Proxy service (the demo centrepiece)  
- Dashboard  
- Report generation  
- Email \+ approval gate  
- Prospect seeder  
- **Architecture diagram** (required submission artifact)  
- **Devpost write-up** draft  
- **Bonus content**: blog post \+ LinkedIn post with `#AllThingsAgenticHackathon`

That is a full plate, and the last three are worth real points.

**If the partner is comfortable in Python**, agent 3 (`VisualAuditor`) is the one clean piece to hand over. It is self-contained — screenshot and DOM in, findings JSON out — needs no ADK knowledge beyond a single `LlmAgent` definition, and is the most prompt-iteration-heavy agent in the set. The contract means it can be built and tested in isolation against a saved screenshot, then dropped in.

Decide this now, not Sunday.  
