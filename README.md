# A11ySentinel

An autonomous agent that audits websites for WCAG 2.1 AA / RGAA accessibility
violations, prioritises them by user impact, drafts source-level code fixes,
and verifies each fix by re-running a deterministic rule engine against the
patched DOM.

Built for the Google Cloud **All Things Agentic Hackathon** — Taskmaster track.

**Live pipeline:** https://a11ysentinel-pipeline-708226575684.us-central1.run.app
(Cloud Run, `us-central1`, project `a11ysentinel`)

```bash
curl -X POST https://a11ysentinel-pipeline-708226575684.us-central1.run.app/audit \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.w3.org/WAI/demos/bad/before/home.html"}'
```

## What it does, precisely

A11ySentinel **finds** violations, **prioritises** them by user impact,
**drafts** fixes, and **verifies** them. A human approves every change.

It does **not** make a site compliant, and it is **not an overlay**. Overlays
inject runtime patches that hide problems from the page but not from assistive
technology. A11ySentinel produces source diffs a developer merges into their
own codebase. Any fix it cannot make honestly — alt text for a photo it has
never seen, the destination of an ambiguous link — is returned with
`requiresHumanInput: true` and guidance on what a person needs to supply,
rather than a plausible guess.

## Architecture

Seven ADK agents behind a `SequentialAgent` orchestrator:

| # | Agent | Type | Uses Gemini |
|---|---|---|---|
| 1 | `RootOrchestrator` | `SequentialAgent` | no |
| 2 | `RuleAuditor` | Custom (axe-core) | no |
| 3 | `VisualAuditor` | `LlmAgent` | yes |
| 4 | `TriageAgent` | `LlmAgent` | yes |
| 5 | `RemediationFanOut` | `ParallelAgent` | no |
| 6 | `Remediator` | `LlmAgent`, one per finding | yes |
| 7 | `Verifier` | Custom (axe re-run) | no |

Agents 2 and 7 are deliberately model-free. The before/after violation counts
come from the same deterministic rule engine run twice, so the numbers are
reproducible rather than asserted.

| Layer | Choice |
|---|---|
| Model | Gemini 3.5 Flash via Vertex AI |
| Agent framework | Google ADK (Python) |
| Browser | Playwright (Chromium) |
| Rule engine | axe-core 4.10.2, vendored and pinned by SHA-256 |
| Compute | Cloud Run + Cloud Run Jobs |
| Queue | Pub/Sub |
| Store | Firestore |
| Artifacts | Cloud Storage |
| Guardrails | Model Armor |
| Web layer | Node / TypeScript |

## The finding lifecycle

Every finding carries a `status`, and the distinction is the point of the
project:

| `status` | Means | Shown to a user? |
|---|---|---|
| `detected` | A real violation. No fix drafted. | Yes, as a finding — never as a fix |
| `patched` | A fix was drafted but has not survived verification | **Never** |
| `verified` | Fix applied, axe re-run, original gone, nothing new introduced | Yes, as a finding and a fix |

An unverified fix never reaches the report or the proxy. This is enforced in
code at the write gate, not by convention — see
`pipeline/tests/test_lifecycle.py`.

---

# Spin-up

## Prerequisites

- Python 3.11+
- A Google Cloud project with billing enabled
- `gcloud` CLI ([install](https://cloud.google.com/sdk/docs/install))

## Pipeline (backend)

```bash
cd pipeline
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m playwright install chromium
```

Vendor the rule engine. It is pinned by version and verified by SHA-256, so a
different build cannot silently change your violation counts:

```bash
python scripts/fetch_axe.py
```

Run an audit locally — no Google Cloud credentials needed, because agents 2
and 7 use no model:

```bash
python audit_cli.py https://www.w3.org/WAI/demos/bad/before/home.html
```

Add `--out result.json` to write contract-shaped JSON. The output has the same
keys as `contracts/fixtures/audit-sample.json`, so it can be dropped straight
into the web layer as a fixture.

Run the lifecycle guards:

```bash
python -m tests.test_lifecycle
```

## Deploy to Cloud Run

```bash
cd pipeline
./deploy.sh YOUR_PROJECT_ID us-central1
```

The script is idempotent. It enables the required APIs, creates the Firestore
database and the artifacts bucket if they are missing, builds with Cloud Build
and deploys. Docker is not required locally.

Then:

```bash
curl https://YOUR-SERVICE.run.app/readyz
```

Use `/health` rather than `/healthz` for liveness against a deployed
service. Google Frontend intercepts `/healthz` on `.run.app` domains and
answers with its own 404 before the request reaches the container.

`/readyz` launches Chromium and checks axe is vendored — a container that
starts but cannot run the rule engine would otherwise accept traffic and fail
every audit.

```bash
curl -X POST https://YOUR-SERVICE.run.app/audit \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}'
```

## Configuration

Copy `pipeline/.env.example` to `pipeline/.env` and fill it in. `.env` is
gitignored; never commit real values. Secrets in deployed environments go in
Secret Manager.

| Variable | Purpose |
|---|---|
| `GOOGLE_CLOUD_PROJECT` | Project id |
| `GOOGLE_CLOUD_LOCATION` | Region, e.g. `us-central1` |
| `GEMINI_MODEL` | Default `gemini-3.5-flash` |
| `ARTIFACTS_BUCKET` | Cloud Storage bucket for screenshots |
| `MAX_PAGES_PER_AUDIT` | Cost control. Playwright is the cost driver |
| `MIN_CONFIDENCE` | Findings below this are discarded before write |
| `PERSIST_TO_FIRESTORE` | Set `false` to run the service without a database |

## Web layer (dashboard + proxy)

<!-- Partner: your setup steps go here. Node version, install, env vars, dev
     server command, and how to point the dashboard at a deployed pipeline. -->

_To be completed._

---

## The data contract

`contracts/schema.md` is authoritative. The pipeline writes; the web layer
reads. `contracts/fixtures/audit-sample.json` carries four findings covering
every UI state, so the web layer can be built before the pipeline produces
real data.

## Repo layout

| Path | Contents |
|---|---|
| `pipeline/` | Python, ADK, Playwright, axe-core. Produces data. |
| `web/` | TypeScript, Node. Dashboard and proxy. Consumes data. |
| `contracts/` | Shared schema and fixtures. Agree before changing. |
| `docs/` | Project plan, agent register, prompts. |

## Scope

Targets the ten axe rules covering the majority of real violations rather than
attempting full WCAG coverage. Demo targets are server-rendered; JS-heavy SPAs
are out of scope. No authentication, no multi-tenancy, no full-site crawl
beyond the page cap.

## Responsible use

Audits can be triggered manually or by prospecting. Three guards are
non-negotiable:

1. **Approval gate** — no email is sent without a human clicking send.
2. **Neutral language** — reports describe findings and fixes. No legal
   threats, no urgency framing, no scare marketing. Every message carries a
   visible opt-out.
3. **Demo safety** — demonstrations run against a domain we control.

Fetched page content is treated as untrusted throughout. Text inside an
audited page is data to be assessed, never an instruction to follow.
