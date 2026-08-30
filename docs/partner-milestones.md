# Partner Milestones — Workstream B

Written by Lewis to keep the two halves in sync. **Yours to edit** — correct
anything wrong, and tell me if a milestone is unrealistic rather than
discovering it Sunday night.

**Deadline: Monday 31 August 2026. Submit at 15:00 PDT, not 17:00** — Devpost
slows near deadlines.

---

## Read this first — the contract moved three times

Sorry. All three are on `main` now. Pull before you build anything else.

| Draft | Change | Breaking? |
|---|---|---|
| 2 | `status` added to Finding | additive |
| 3 | `announcedBefore` / `announcedAfter` added | additive |
| 4 | **`rgaaCriterion` → `regionalFramework` + `regionalCriterion`** | **yes** |

**Draft 4 is the one that breaks you.** If you bound a table column to
`rgaaCriterion`, it is now two fields. We moved to WCAG-first framing — we
measure WCAG 2.1 AA for every site globally, and only *name* a regional
framework as context. A field named after one country did not survive that.

**Draft 3 is the one that helps you most.** `announcedBefore` /
`announcedAfter` carry what a screen reader actually says:

```
link:  (nothing announced)   →   link:  "Panier"
button:(nothing announced)   →   button:"Rechercher"
```

**Render that as the headline before/after.** Almost every fix we make changes
no pixels — `alt`, `aria-label` and `lang` are invisible — so a side-by-side
screenshot of a fixed page shows two identical images. This is where the change
is actually visible, and it carries the point better than a code diff for
anyone who does not read HTML.

It also means your proxy is no longer the only visual payoff. If B2 slips,
the demo still works.

**Rendering rule for that pair:** the two fields are **always both set or both
null**. If `announcedBefore` is null, skip the announcement row entirely — do
not render an empty string and do not fill one in. The pipeline nulls them when
the announcement did not change, when only one side was readable, and when no
patch was applied, so anything you receive is a real difference worth showing.
A `PLACEHOLDER_AS_LABEL` fix, for instance, is a genuine improvement whose
computed name does not change — you get nulls there, and the finding still
carries its diff and its impact.

---

## What the pipeline already gives you

**All seven agents are built and deployed.** You are not waiting on me for
anything below.

| | |
|---|---|
| **Live service** | `https://a11ysentinel-pipeline-708226575684.us-central1.run.app` |
| **GCP project** | `a11ysentinel`, region `us-central1` |
| **Firestore** | `audits/{auditId}` and `audits/{auditId}/findings/{findingId}` |
| **Storage** | `gs://a11ysentinel-artifacts` (screenshots) |
| **Fixture** | `contracts/fixtures/audit-sample.json` — 4 findings, every UI state |
| **Contract** | `contracts/schema.md` — **draft 4**, authoritative |
| **Demo target** | `.../demo/index.html` — our own seeded site |

Try it:

```bash
curl -X POST https://a11ysentinel-pipeline-708226575684.us-central1.run.app/audit \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.w3.org/WAI/demos/bad/before/home.html"}'
```

Add `"visual": true` for the multimodal pass, `"remediate": true` for real
patches, `"modelTriage": true` for plain-language impact. On our demo site
the full run gives **21 violations to 4**, with 24 findings — 21 from axe,
3 the rule engine cannot reach.

**Real output has the same keys as the fixture**, so a UI built on the fixture
works on real data with no changes.

---

## Four rules your UI must honour

These are not style preferences. Getting any of them wrong undermines the
whole pitch, because the project is positioned against exactly this failure.

**1. Branch on `status`, never on `verified`.**

| `status` | Render as |
|---|---|
| `detected` | A finding. **No diff shown** — there is no fix yet |
| `patched` | **Nothing. Never render it.** A draft that failed verification |
| `verified` | A finding *and* its diff |

**2. `requiresHumanInput: true` renders as "needs a human", never as done.**
`patchedCode` will contain a placeholder like `alt="TODO: describe this
image"`, and `humanGuidance` explains what a person must supply. Showing that
as a completed fix is the single worst thing the UI could do. `f_002` in the
fixture is your test case.

**3. Never write or imply "compliant", "fixed", "accessible now", or a score.**
The tool **finds**, **prioritises**, **drafts**, and **verifies**. A human
approves every change. The FTC fined accessiBe $1M over precisely this claim.
`violationsAfter` is a measured count, not a grade.

**4. The proxy is a preview, not an overlay.** It renders the client's page
with our verified patches applied so they can *see* the difference. It is not
a widget anyone installs, and we never suggest it can be. What we ship them is
a source diff they merge themselves. If the design starts drifting toward
"embed this script on your site", stop and flag it.

---

## Your deliverables

### B1 — Dashboard
Submit a URL, watch audit status, list findings, show the before/after counter.
**Done when:** it renders all four fixture findings correctly, including the
`detected` one with no diff and the `requiresHumanInput` one flagged for a
human.

### B2 — Proxy service
Fetch the target page, apply `patchedCode` by `selector`, serve the corrected
version. Only findings with `status: "verified"`.
**Done when:** it fetches any server-rendered page, applies at least one patch
by selector, and serves it. `patchedCode` is a fragment replacing the element
matched by `selector` — not a whole-file diff.

### B3 — Report generation
A structured remediation document generated from findings.
**Done when:** a report renders from a real audit with neutral language and no
compliance claim.

### B4 — Email + approval gate
Gmail API send, behind a human clicking send.
**Done when:** nothing can send without a human click, language is neutral (no
legal threats, no urgency framing, no scare marketing), and every message
carries a visible opt-out line.

### B5 — Architecture diagram
**Required submission artifact.** Judges look for it.

### B6 — ~~`VisualAuditor` (agent 3)~~ — **built, not yours**

Lewis built it. **Do not spend time on this.** Put those hours into B2 and B5.

Worth knowing what it does, because it is the strongest thing in the demo.
axe can tell you an alt attribute is missing; it cannot tell you the alt text
is useless. On our demo page it found three problems no rule engine can reach:

| Finding | Why axe misses it |
|---|---|
| `MEANINGLESS_LINK_TEXT` — "cliquez ici" | The link *has* text, so the rule passes |
| `COLOUR_ONLY_MEANING` — stock as a green/red dot | Needs to see colour is the only signal |
| `PLACEHOLDER_AS_LABEL` — the search field | axe accepts a placeholder as an accessible name |

That last one is the demo moment: **axe reports the field as fine, and the
visual agent catches it.** If you are writing the Devpost description, that one
contrast is the whole multimodal argument in a sentence.

Findings from it arrive with `source: "visual"` and carry `evidence` — what the
model actually saw. `source: "axe"` findings have `evidence: null`. Both flow
through remediation and verification identically, so your UI needs no special
case beyond showing `evidence` when it is present.

### B7 — Prospect list seeder
Feeds the prospecting trigger.

### B8 — README frontend half
`README.md` has a marked placeholder. Backend half is written.

### B9 — Devpost write-up
Draft from the project plan; I review.

---

## Is this too much? Worth saying now rather than Sunday

**All seven agents are built**, so the pipeline needs nothing further from
you. That takes B6 off your list entirely and leaves eight items, of which two
are the ones that matter:

- **B2, the proxy.** The only piece of the demo still missing.
- **B5, the architecture diagram.** A required submission artifact. Nothing
  substitutes for it, and it cannot slip.

Two you can drop if time gets tight:

- **B7, the prospect seeder** — the pipeline already picks its own targets from
  a configured pool, so this adds nothing the demo needs.
- **B3, the report** — a styled view of the findings list would carry the same
  point as a separate document.

If anything here is further along than I think, tell me and I will stop
guessing at your side of the board.

---

## Only you can do these — you own the repo

- [ ] **Switch the default branch to `main`** (Settings → Branches)
- [ ] **Share the private repo** with `testing@devpost.com` and
      `cloudhackathons@google.com` — miss this and it can't be judged
- [ ] Move your work to `web/*` branches (you're currently on `deborah`)

---

## Answers I need from you

1. **Audit `status` enum.** The plan stops at `capturing` / `auditing`. The
   pipeline also remediates and verifies. Want `remediating` and `verifying`
   added so the dashboard can show live progress, or keep four states?
2. **Who writes `proxyUrl`?** I've assumed you do, once the proxy can serve.
3. **`rgaaCriterion` nullable?** Currently nullable. If a null breaks a table
   column, I can emit `"n/a"`.
4. ~~Are you taking `VisualAuditor`?~~ **Answered — it is built.** Nothing
   needed from you.
5. **Demo target site.** See the note below.

---

## Demo target — settled

Lewis built one. `pipeline/demo-site/` is **Marché Antsahabe**, a fictional
grocer seeded with violations across six of the targeted rules, served from our
own Cloud Run service at `/demo` and shipped inside the image so there is no
separate host to fail on Monday.

```
https://a11ysentinel-pipeline-708226575684.us-central1.run.app/demo/index.html
```

That satisfies outreach guard 3 — the video runs against a domain we control,
and no real business is depicted. **Autonomous selection still happens:** the
prospect pool points at our own pages, which carry different violation counts,
so the agent genuinely chooses. The autonomy is in the picking; the safety is
in the pool.

Measured on it: **21 violations → 4**, with 17 verified fixes and 3 flagged for
human input. The remaining four are colour-contrast, which we deliberately do
not auto-patch because it lives in CSS — an easy line to deliver on camera.

## Running the agent graph yourself

Agents 1, 2 and 7 are ADK constructs, so you can watch the whole pipeline run
stage by stage:

```bash
cd pipeline
adk web adk_apps --port 8779
```

Open `http://127.0.0.1:8779/dev-ui/`, pick `a11ysentinel_audit`, paste a URL
and click the send arrow — Enter does not submit. You get the agent graph
drawn from the `sub_agents` list, an event feed, and the session state written
by each step. It is a better architecture exhibit than a slide, so it is worth
a few seconds in the video.

Three things that will otherwise cost you an afternoon, all of which cost me
one:

1. The app folder must not share a name with a package you import. `adk web`
   puts the agents directory on `sys.path` and imports each subfolder by name,
   so an app called `a11ysentinel` shadows the package of the same name and
   fails as a circular import.
2. Only the agents directory lands on `sys.path`, so the app has to locate the
   project root itself.
3. State only persists through `Event.actions.state_delta`.

You will need `gcloud auth application-default login` for the Gemini stages.
Without it, triage falls back to the deterministic sort and remediation drafts
nothing — the run still completes with honest numbers, which is the fallback
working, but you only see half the pipeline.

---

## Schedule

### Saturday, remainder
- **You:** dashboard scaffolding against the fixture. Proxy skeleton — fetch a
  page, apply one hardcoded patch by selector, serve it. Prove the concept.
- **Checkpoint:** you have a UI rendering fixture data. I have real findings in
  Firestore. Neither of us waited.

### Sunday morning
- **You:** proxy applies a full patch set from Firestore. Dashboard wired to
  real Firestore data.
- **Lewis:** Pub/Sub fan-out, VisualAuditor if it stays with me.

### Sunday afternoon
- **You:** report generation, email template, approval gate, architecture
  diagram.
- **Lewis:** triage scoring, Remediator, verification loop.

### Sunday evening — hard integration checkpoint
Real audit, real findings, real proxy URL, end to end. **Agree a time.**
If this doesn't work Sunday night, Monday is triage instead of building.

### Monday
- **Morning:** bug fixes only. No new features. Seed the demo site. Full dry run.
- **Midday:** record the video. Multiple takes. Finalise the README.
- **Early afternoon:** submit by **15:00 PDT**.
- **After:** blog post and LinkedIn post with `#AllThingsAgenticHackathon`.

---

## Ship order — cut from the bottom, never the top

| Stage | Agents | Demoable outcome | State |
|---|---|---|---|
| 1 | 1, 2, 7 | Real before/after counts, no Gemini needed | **Done, deployed** |
| 2 | + 5, 6 | Real code patches | **Done, deployed** |
| 4 | + 4 | Prioritised output, plain-language impact | **Done, deployed** |
| 3 | + 3 | Multimodal findings axe cannot catch | **Done, deployed** |

Agents 4 and 5 can ship as a plain sort and a for-loop. If time runs out, cut
from the bottom of that table.

---

## Submission checklist

- [ ] Category: Taskmaster
- [ ] Hosted project URL
- [ ] Description: features, technologies, data sources, findings, learnings
- [ ] Repo shared with `testing@devpost.com` and `cloudhackathons@google.com`
- [ ] README with reproducible spin-up instructions
- [ ] Architecture diagram
- [ ] ~4 min demo video with **visible Google Cloud proof** — Cloud Run
      console, Vertex AI logs, the `.run.app` URL
- [ ] Bonus: public blog/video post naming the hackathon
- [ ] Bonus: social post with `#AllThingsAgenticHackathon`
