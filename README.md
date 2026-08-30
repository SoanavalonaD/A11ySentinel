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

All seven are built and deployed.

| # | Agent | Type | Uses Gemini | What it contributes |
|---|---|---|---|---|
| 1 | `RootOrchestrator` | ADK `SequentialAgent` | no | Composition, session state, event stream |
| 2 | `RuleAuditor` | ADK `BaseAgent` | no | axe-core. The ground truth |
| 3 | `VisualAuditor` | ADK `BaseAgent` (multimodal) | yes | What a rule engine structurally cannot detect |
| 4 | `TriageAgent` | stage | yes | Harm ordering, plain-language impact |
| 5 | `RemediationFanOut` | stage | no | Bounded concurrent fan-out |
| 6 | `Remediator` | stage, one call per finding | yes | Drafts the patch |
| 7 | `Verifier` | ADK `BaseAgent` | no | Re-runs axe. The only step that sets `verified` |

Agent 3 is a `BaseAgent` rather than an `LlmAgent` because every selector the
model returns must be queried against the live DOM before the finding is kept,
and that check belongs in code, not in a prompt.

Agents 2 and 7 are deliberately model-free. The before/after violation counts
come from the same deterministic rule engine run twice, so the numbers are
reproducible rather than asserted.

| Layer | Choice |
|---|---|
| Model | Gemini 3.7 Flash via Vertex AI (`global` endpoint) |
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
python -m tests.test_remediator_validation
```

### The agent graph in ADK's Dev UI

Agents 1, 2 and 7 are ADK constructs. To watch the whole pipeline run,
stage by stage, with live events and inspectable session state:

```bash
adk web adk_apps --port 8777
```

Open `http://127.0.0.1:8777/dev-ui/`, choose `a11ysentinel`, and send a URL
as the message (or send anything to use the default demo target). Headless
equivalent:

```bash
adk run adk_apps/a11ysentinel_audit
```

Agents 4, 5 and 6 run inside those stages rather than as separate ADK
constructs — `remediate_all` already handles bounded concurrency,
per-response validation and rejection reporting, and re-expressing that as
a `ParallelAgent` would risk working code to gain a class name.

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
| `GEMINI_MODEL` | Default `gemini-3.7-flash` |
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

## Security

Everything fetched is untrusted. Defences, outermost first:

| Layer | Behaviour on failure |
|---|---|
| **PII redaction** — emails, phones, IBANs, card numbers | **Fails closed.** Local and deterministic, so it cannot be skipped by an outage |
| **Model Armor** — Google's prompt-injection classifier | **Fails open.** One layer of several; an outage should not block every audit |
| DOM stripping — scripts, styles, comments, inline handlers | n/a, always applied |
| Prompt instructions — page text is data, never a command | n/a |
| Response schema, selector validation, confidence floor | reject the response |
| Verification — axe re-run on the patched DOM | rejects the patch |

The asymmetry between the first two is deliberate: a PII leak is irreversible,
while an injection still has to defeat five further layers.

**Model Armor is screened per text block, not per page.** Its filter evaluates
a prompt, not a document containing one. On our own test page the injection
scored HIGH in isolation and was not flagged at all inside 1,000 characters of
surrounding content. Splitting on block boundaries caught both injections —
the visible one and one hidden off-screen — with no false positives.

Set it up once:

```bash
gcloud services enable modelarmor.googleapis.com
gcloud model-armor templates create a11ysentinel-screen   --location=us-central1   --pi-and-jailbreak-filter-settings-enforcement=enabled   --pi-and-jailbreak-filter-settings-confidence-level=LOW_AND_ABOVE   --malicious-uri-filter-settings-enforcement=enabled   --rai-settings-filters="filterType=DANGEROUS,confidenceLevel=MEDIUM_AND_ABOVE"
```

Then set `MODEL_ARMOR_ENABLED=true`. Without it the pipeline still runs; the
audit output says the classifier was not consulted rather than implying it
passed.

`demo-site/avis.html` is the test page: a reviews page carrying two injection
attempts and invented personal data, so the defences can be demonstrated rather
than asserted.

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
