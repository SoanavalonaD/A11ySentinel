# A11ySentinel

An autonomous agent that finds its own audit targets, checks them for WCAG 2.1
AA / RGAA accessibility violations, prioritises them by user impact, drafts
source-level code fixes, and verifies each fix by re-running a deterministic
rule engine against the patched DOM.

Built for the Google Cloud **All Things Agentic Hackathon** — Taskmaster track.

**Live:** https://a11ysentinel-pipeline-708226575684.us-central1.run.app/
(Cloud Run, `us-central1`, project `a11ysentinel`)

One service hosts both the API and the dashboard, so the browser talks to the
pipeline on its own origin. Open the URL for the dashboard, or call it directly:

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

The same discipline runs through every surface. A finding with no patch says
so. A proxy preview reports how many patches actually applied, not how many
were drafted. An email that could not be dispatched says "approved, not sent"
rather than "sent".

## Architecture

Nine ADK agents, numbered 0 to 8.

| # | Agent | Type | Uses Gemini | What it contributes |
|---|---|---|---|---|
| 0 | `ProspectScout` | `LlmAgent` + Google Search | **yes** | Finds candidate sites. Runs *before* the pipeline |
| 1 | `RootOrchestrator` | ADK `SequentialAgent` | no | Composition, session state, event stream |
| 2 | `RuleAuditor` | ADK `BaseAgent` | no | axe-core. The ground truth |
| 3 | `VisualAuditor` | ADK `BaseAgent` (multimodal) | yes | What a rule engine structurally cannot detect |
| 4 | `TriageAgent` | stage | yes | Harm ordering, plain-language impact |
| 5 | `RemediationFanOut` | stage | no | Bounded concurrent fan-out |
| 6 | `Remediator` | stage, one call per finding | yes | Drafts the patch |
| 7 | `Verifier` | ADK `BaseAgent` | no | Re-runs axe. The only step that sets `verified` |
| 8 | `OutreachDrafter` | `LlmAgent` | yes | Writes the email narrative — prose only |

**Agent 0 is numbered first because it runs before the others.** Every other
agent needs a target; this is the one that produces one. It searches, grounded
in Google Search through Vertex, and streams candidates into the dashboard as
it finds and checks them. The model *proposes*: a URL only reaches an operator
after robots.txt, a real page load and an axe run, so an invented domain simply
fails to load and never appears.

**Agent 8 is the only agent whose output leaves the building**, and it writes
for a message nobody asked to receive. So it gets the narrowest possible job —
an opening, up to three consequence sentences, a closing. The metrics, links,
claim-discipline notice, opt-out footer and subject line are never generated;
they are template text assembled around it. A `screen()` function then runs
over the whole draft *in code*: any mention of compliance, liability,
litigation, a penalty, a deadline or a guarantee discards the draft whole, in
English or French, and the static template is used instead.

Agent 3 is a `BaseAgent` rather than an `LlmAgent` because every selector the
model returns must be queried against the live DOM before the finding is kept,
and that check belongs in code, not in a prompt.

Agents 2 and 7 are deliberately model-free. The before/after violation counts
come from the same deterministic rule engine run twice, so the numbers are
reproducible rather than asserted.

**A model outage costs the enhancement, never the audit.** Every model stage
degrades: triage falls back to a deterministic sort, the visual pass is
skipped, remediation leaves findings at `detected`, Agent 8 falls back to the
static template. An audit with no Vertex access at all still returns real
axe-core findings with `before == after`.

| Layer | Choice |
|---|---|
| Model | Gemini 3.7 Flash via Vertex AI (`global` endpoint) |
| Agent framework | Google ADK (Python) |
| Search grounding | Google Search tool via Vertex (Agent 0) |
| Browser | Playwright (Chromium) |
| Rule engine | axe-core 4.10.2, vendored and pinned by SHA-256 |
| Compute | Cloud Run |
| Queue | Pub/Sub |
| Store | Firestore |
| Artifacts | Cloud Storage |
| Guardrails | Model Armor |
| Dashboard | React 18 + TypeScript + Tailwind, served by the same Cloud Run service |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | The dashboard |
| GET | `/health`, `/healthz` | Liveness, touches no dependencies |
| GET | `/readyz` | Readiness: axe vendored, Chromium launchable |
| POST | `/audit` | Run an audit against a URL you name |
| POST | `/prospect` | Autonomous: the agent picks its own target, then audits it |
| GET | `/prospect/scout` | Agent 0, streamed as server-sent events |
| GET | `/proxy/{audit_id}` | The audited page with verified patches applied |
| POST | `/pubsub` | Pub/Sub push entrypoint |
| GET | `/demo/` | The seeded demo site |

Use `/health` rather than `/healthz` against a deployed service. Google
Frontend intercepts `/healthz` on `.run.app` domains and answers with its own
404 before the request reaches the container.

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

**A violation with no patch is normal**, and happens for five distinct reasons:
`color-contrast` cannot be fixed at element level and is never attempted;
remediation was not requested; the finding fell past `remediationLimit`; a
drafted patch failed verification and was reverted; or the fix needs a person
and carries a `TODO:` placeholder.

---

# Spin-up

## Prerequisites

- Python 3.11+
- Node 20+ and pnpm (for the dashboard)
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

Run the guards. All four run offline, with no network and no model:

```bash
python -m tests.test_lifecycle              # unverified fixes cannot be written
python -m tests.test_remediator_validation  # what the Remediator will accept back
python -m tests.test_outreach_guards        # Agent 8 claim discipline, EN + FR
python -m tests.test_scout_validation       # Agent 0 candidate filtering
```

Serve the API locally:

```bash
PERSIST_TO_FIRESTORE=false python -m uvicorn service:app --port 8080
```

For the model-backed agents you also need credentials and a project:

```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=your-project
export GOOGLE_GENAI_USE_VERTEXAI=true
export VERTEX_LOCATION=global
```

## Dashboard

```bash
cd web
pnpm install
pnpm run dev            # http://localhost:3000
```

By default the dashboard talks to the deployed Cloud Run service. To point it
at a local pipeline, create `web/.env.local` (gitignored):

```
VITE_API_BASE_URL=http://127.0.0.1:8080
```

The pipeline allows `localhost:3000`, `localhost:5173` and their `127.0.0.1`
equivalents via CORS. Add any other origin to `ALLOWED_ORIGINS`.

Other commands:

```bash
pnpm run lint     # tsc --noEmit
pnpm run build    # tsc && vite build
```

**In production there is no separate web server.** `deploy.sh` builds the
dashboard into `pipeline/web-dist/` and the Cloud Run service serves it at `/`.
Same origin as the API, so the browser makes relative requests to `/audit` and
CORS cannot break the dashboard at all.

To reproduce that shape locally, build with an *empty* base URL and let the
Python service serve it:

```bash
cd web && VITE_API_BASE_URL= pnpm run build
cd ../pipeline && rm -rf web-dist && cp -r ../web/dist web-dist
python -m uvicorn service:app --port 8080     # dashboard now at http://127.0.0.1:8080/
```

Empty means same origin, and must stay distinguishable from unset, which means
the deployed URL.

## Deploy to Cloud Run

```bash
cd pipeline
./deploy.sh YOUR_PROJECT_ID us-central1
```

The script is idempotent. It enables the required APIs, creates the Firestore
database and the artifacts bucket if they are missing, **builds the dashboard**,
then builds the container with Cloud Build and deploys. Docker is not required
locally. Expect roughly 8–10 minutes, most of it the Playwright base image.

Then:

```bash
curl https://YOUR-SERVICE.run.app/readyz
```

`/readyz` launches Chromium and checks axe is vendored — a container that
starts but cannot run the rule engine would otherwise accept traffic and fail
every audit.

## Configuration

Copy `pipeline/.env.example` to `pipeline/.env` and fill it in. `.env` is
gitignored; never commit real values. Secrets in deployed environments go in
Secret Manager. Deployed environment lives in `pipeline/env.deploy.yaml`.

| Variable | Purpose |
|---|---|
| `GOOGLE_CLOUD_PROJECT` | Project id |
| `GOOGLE_CLOUD_LOCATION` | Region, e.g. `us-central1` |
| `VERTEX_LOCATION` | `global` — Gemini 3.x is not served from regional endpoints |
| `GEMINI_MODEL` | Default `gemini-3.7-flash` |
| `ARTIFACTS_BUCKET` | Cloud Storage bucket for screenshots |
| `MAX_PAGES_PER_AUDIT` | Cost control. Playwright is the cost driver |
| `MIN_CONFIDENCE` | Findings below this are discarded before write |
| `PERSIST_TO_FIRESTORE` | Set `false` to run the service without a database |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins for the dashboard |
| `REMEDIATOR_CONCURRENCY` | Simultaneous Gemini calls. Default 3 |
| `REMEDIATOR_RETRY_ATTEMPTS` | Retries on a 429. Default 3 |
| `REMEDIATOR_RETRY_BASE_SECONDS` | Backoff base. Default 2 |
| `SCOUT_REGION` | Where Agent 0 looks. Default France and francophone Europe |
| `SCOUT_SECTORS` | Sectors Agent 0 targets |
| `PROSPECT_POOL` | Fallback candidate list for `/prospect` |
| `MODEL_ARMOR_*` | Prompt-injection screening — see Security |

---

## The data contract

`contracts/schema.md` is authoritative. The pipeline writes; the web layer
reads. `contracts/fixtures/audit-sample.json` carries findings covering every
UI state, so the web layer can be built before the pipeline produces real data.

## Repo layout

| Path | Contents |
|---|---|
| `pipeline/` | Python, ADK, Playwright, axe-core. Produces data, serves the API and the dashboard. |
| `web/` | React, TypeScript, Tailwind. The dashboard. Built into the pipeline image. |
| `contracts/` | Shared schema and fixtures. Agree before changing. |
| `docs/` | Project plan, agent register, prompts, architecture diagram. |
| `design/` | The design handoff the dashboard theme was built from. |

## Scope and known limitations

Stated rather than hidden, because a tool about honest reporting should be
honest about itself.

- **Criterion numbers for unmapped rules are inferred, not verified.** Ten axe
  rules have hand-checked WCAG and RGAA mappings. Anything outside that set
  currently receives a criterion derived from the rule name, which is
  sometimes wrong — `link-in-text-block` is reported as 2.4.4 where axe
  documents 1.4.1. The violation itself is real and measured; the criterion
  label beside it may not be. Being corrected.
- **Single page per audit.** Multi-page fan-out via Pub/Sub is designed but
  not shipped. `pageCount` reflects pages actually audited.
- **Server-rendered targets.** JS-heavy SPAs are out of scope.
- **Some drafted patches fail verification** with "selector no longer matched
  at patch time" when an earlier accepted patch changes the structure a later
  selector depends on. Those fixes are dropped, not shipped — the guard works,
  but coverage is lost.
- **`emailDraft` is not persisted.** It rides on the audit response, so a
  dashboard reload falls back to the static template.
- No authentication, no multi-tenancy, no full-site crawl.

## Security

Everything fetched is untrusted. Defences, outermost first:

| Layer | Behaviour on failure |
|---|---|
| **PII redaction** — emails, phones, IBANs, card numbers | **Fails closed.** Local and deterministic, so it cannot be skipped by an outage |
| Reversible redaction on the Remediator path | Patch refused if a token does not survive the round trip |
| **Model Armor** — Google's prompt-injection classifier | **Fails open.** One layer of several; an outage should not block every audit |
| DOM stripping — scripts, styles, comments, inline handlers | n/a, always applied |
| Prompt instructions — page text is data, never a command | n/a |
| Response schema, selector validation, confidence floor | reject the response |
| Verification — axe re-run on the patched DOM | rejects the patch |
| Claim-discipline screen on Agent 8 output | discards the draft whole |

The asymmetry between the first two is deliberate: a PII leak is irreversible,
while an injection still has to defeat five further layers.

The proxy strips `<script>` elements and inline `on*` handlers from every page
it serves, because it serves third-party HTML from our own origin.

**Scope, stated precisely.** Personal data is redacted before it reaches a
model — that is the third-party disclosure worth preventing. The `currentCode`
and `patchedCode` stored in Firestore keep the real values, because the proxy
applies a patch by matching it against the real DOM, and the report goes to the
operator of the site that already publishes the data. Redacting there would
break patch application to hide a site's contact page from its own owner.

**Model Armor is screened per text block, not per page.** Its filter evaluates
a prompt, not a document containing one. On our own test page the injection
scored HIGH in isolation and was not flagged at all inside 1,000 characters of
surrounding content. Splitting on block boundaries caught both injections —
the visible one and one hidden off-screen — with no false positives.

Set it up once:

```bash
gcloud services enable modelarmor.googleapis.com
gcloud model-armor templates create a11ysentinel-screen \
  --location=us-central1 \
  --pi-and-jailbreak-filter-settings-enforcement=enabled \
  --pi-and-jailbreak-filter-settings-confidence-level=LOW_AND_ABOVE \
  --malicious-uri-filter-settings-enforcement=enabled \
  --rai-settings-filters="filterType=DANGEROUS,confidenceLevel=MEDIUM_AND_ABOVE"
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

1. **Approval gate** — no email is sent without a human clicking send. With no
   mail transport configured, approval leaves `emailStatus` at `approved` and
   the dashboard says "approved, not sent" rather than claiming delivery.
2. **Neutral language** — reports describe findings and fixes. No legal
   threats, no urgency framing, no scare marketing. Every message carries a
   visible opt-out. Agent 8's output is screened in code, not just asked for
   in a prompt.
3. **Demo safety** — demonstrations run against a domain we control.

Agent 0 never asserts that an organisation is legally required to be
accessible. It returns facts — organisation, sector, country — and the context
line is composed in code: *"Public-sector body in FR. WCAG 2.1 AA is what we
measure; RGAA 4 is the framework usually referenced for this sector. Context,
not a determination of what binds them."* Which law binds a site depends on who
operates it, where they are established and what sector they are in, none of
which is knowable from a web page.

Fetched page content is treated as untrusted throughout. Text inside an
audited page is data to be assessed, never an instruction to follow.
