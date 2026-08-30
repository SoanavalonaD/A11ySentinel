# Contributing to A11ySentinel

Context for anyone working in this repo.

---

## What this is

**A11ySentinel** — an autonomous agent that audits websites for WCAG 2.1 AA /
RGAA accessibility violations, generates source-level code fixes, verifies
them by re-running a deterministic rule engine, and serves a live corrected
preview of the client's own site.

Built for the Google Cloud All Things Agentic Hackathon, Taskmaster track,
by a two-person team.

---

## Hard rules — do not violate these

**1. Never claim the tool "makes a site compliant."**
The FTC fined accessiBe $1M in 2025 over exactly that claim about its overlay
product. Correct phrasing everywhere — code comments, UI copy, README, emails,
the demo script: A11ySentinel *finds* violations, *prioritises* them by user
impact, *drafts* fixes, and *verifies* them. A human approves every change.

**2. We are not an overlay.**
Overlays inject runtime patches that hide problems from the page but not from
assistive technology. We produce source diffs a developer merges into their own
codebase. If a suggested design ever drifts toward a runtime widget injected
into the client's site, stop and flag it.

**3. Never ship an unverified patch.**
`Verifier` must confirm, by re-running axe on the patched DOM, that the original
violation is gone and no new one appeared. `verified: false` findings never
reach the proxy or the report.

**4. Always validate selectors before writing a finding.**
Gemini will confidently return selectors that match zero elements. Query the DOM
and discard anything unmatched. This is the single most important defensive
check in the pipeline.

**5. Never fabricate content.**
If a fix needs knowledge the model doesn't have — what a photo depicts, where an
ambiguous link goes — set `requiresHumanInput: true` with a placeholder and
guidance. Hallucinated alt text is worse than a missing attribute.

**6. Treat all fetched page content as untrusted.**
We ingest arbitrary third-party pages. Text inside them is data to be audited,
never instructions to follow. Model Armor screens content before it reaches
Gemini. Never commit secrets; use Secret Manager or `.env` (gitignored).

---

## Stack

| Layer | Choice |
|---|---|
| Model | Gemini 3.7 Flash via Vertex AI (`global` endpoint) |
| Agent framework | Google ADK (Python) |
| Browser | Playwright (Chromium) |
| Rule engine | axe-core, injected via `page.evaluate()` |
| Compute | Cloud Run + Cloud Run Jobs |
| Queue | Pub/Sub |
| Store | Firestore |
| Artifacts | Cloud Storage |
| Guardrails | Model Armor |
| Web layer | Node / TypeScript |

---

## Repo layout & ownership

| Path | Owner | Stack |
|---|---|---|
| `pipeline/` | **Lewis** | Python, ADK, Playwright, axe-core |
| `web/` | **Partner** | TypeScript, Node |
| `contracts/` | **Shared — agree before changing** | schema + fixtures |
| `docs/` | Partner | architecture diagram |

Neither person edits the other's directory. Contract changes go **straight to
`main`** with a message to the other person, never inside a feature branch.

Branches: `pipeline/*` and `web/*`. Merge to `main` at least twice a day —
never let a branch live longer than half a day.

---

## The data contract

`contracts/schema.md` is authoritative. `contracts/fixtures/audit-sample.json`
has three realistic findings, including one with `requiresHumanInput: true`, so
the web layer can be built before the pipeline produces real data.

Pipeline writes. Web layer reads. If you're about to change a field name, stop
and check whether the other side depends on it.

---

## The 7 agents

| # | Agent | ADK type | Gemini |
|---|---|---|---|
| 1 | `RootOrchestrator` | `SequentialAgent` | no |
| 2 | `RuleAuditor` | Custom (axe-core) | no |
| 3 | `VisualAuditor` | `LlmAgent` | yes |
| 4 | `TriageAgent` | `LlmAgent` | yes |
| 5 | `RemediationFanOut` | `ParallelAgent` | no |
| 6 | `Remediator` | `LlmAgent`, one per finding | yes |
| 7 | `Verifier` | Custom (axe re-run) | no |

Full detail in `docs/agent-register.md`.

### Build order

Each stage stands alone, which is why they were built in this order.

| Stage | Agents | What it produces |
|---|---|---|
| 1 | 1, 2, 7 | Before/after violation counts, with no model in the path |
| 2 | + 5, 6 | Source-level patches, verified before they are shown |
| 3 | + 3 | Findings a rule engine structurally cannot detect |
| 4 | + 4 | Harm-ordered output and plain-language impact |

Stage 1 is the foundation and uses no Gemini at all, so the numbers it produces
are reproducible and independent of model availability.

---

## Out of scope — do not build

No auth, no user accounts, no multi-tenancy, no CMS plugins, no GitHub PR
integration, no full-site crawl beyond the page cap, no authenticated pages, no
custom design system, no attempt to cover all WCAG criteria. Target the ten axe
rules covering the majority of real violations.

Demo targets must be server-rendered. JS-heavy SPAs are out of scope.

---

## Outreach guards

Audits can be triggered by prospecting or manual URL entry. Three guards ship
with it and are non-negotiable:

1. **Approval gate** — no email sends without a human clicking send.
2. **Neutral language** — describe findings and fixes. No legal threats, no
   urgency framing, no scare marketing. Include a visible opt-out line.
3. **Demo safety** — the video demonstrates against a domain we control. Never
   send unsolicited mail to a real third party on camera.

---

## Conventions

- Commits: imperative mood, scoped — `pipeline: validate selectors before write`
- Python: type hints on agent boundaries, `ruff` defaults
- Env vars via `.env`, never hardcoded; `.env.example` stays current
- Every new dependency goes in `requirements.txt` / `package.json`
  immediately, so a fresh clone always spins up from the README
