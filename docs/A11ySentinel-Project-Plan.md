# A11ySentinel — Autonomous WCAG/RGAA Remediation Agent

**All Things Agentic Hackathon · Track: Taskmaster** **Deadline: Monday 31 August 2026, 17:00 PDT** (≈ 02:00 CEST Tuesday) **Team: 2 builders, working in parallel**

---

## 1\. The Problem

Digital accessibility is a legal obligation — ADA in the US, the European Accessibility Act, RGAA for French public bodies, WCAG 2.1 AA as the common technical standard. Web accessibility lawsuit filings have exceeded 2,200 per year since 2018\.

But manual audits are slow and expensive, and companies typically discover their non-compliance when a complaint arrives. Remediation is the harder half: frontend developers need precise fixes scoped to their own components (React, Tailwind, Next.js) and their WAI-ARIA attributes — not a rewritten HTML dump of rendered output they can't merge.

## 2\. The Solution

A11ySentinel is an autonomous background agent that discovers, audits, and generates targeted fixes for non-compliant websites.

Three things separate it from existing tooling:

**It sees and reads at the same time.** Static scanners parse the DOM. A11ySentinel runs a deterministic rule engine *and* a multimodal model over a screenshot of the rendered page, catching what structural analysis cannot: alt text that technically exists but is useless, link text meaningless out of context, contrast over background images, visually broken focus order, touch targets below minimum size.

**It outputs diffs, not documents.** Fixes are granular code snippets isolated by CSS selector or XPath — `aria-label` additions, utility class corrections, semantic element swaps — ready to paste into a component.

**It proves the fix works.** An ephemeral proxy renders the client's own site with the patches applied live, so they see their corrected site rather than reading about it. Underneath, the rule engine re-runs against the patched DOM to produce a hard before/after number.

### Positioning

In January 2025 the FTC required accessibility overlay vendor accessiBe to pay $1 million over claims that its AI widget could make any website WCAG-compliant; the complaint alleged the plug-in failed on basics like navigation menus, form fields and image descriptions. Over 800 businesses using overlay widgets were sued anyway in 2023–2024.

**A11ySentinel is the opposite of an overlay.** Overlays inject a runtime patch that hides the problem from the page but not from assistive technology. We generate source-level fixes the team merges into their own codebase, and we verify the result.

**Claim discipline — non-negotiable in every artifact we produce.** We never say A11ySentinel *makes a site compliant*. We say it finds violations, prioritises them by user impact, drafts verified fixes, and measurably reduces violation count with a human approving every change. This is precisely the claim the FTC ordered accessiBe to stop making, and any judge who knows the space will notice.

## 3\. Hackathon Alignment

| Requirement | How we meet it |
| :---- | :---- |
| Gemini 3.5 or newer | Gemini 3.5 Flash via Vertex AI, for multimodal audit \+ remediation |
| Google agent framework | Google ADK (Python) |
| Google Cloud infrastructure | Cloud Run, Cloud Run Jobs, Pub/Sub, Firestore, Cloud Storage, Secret Manager |
| Asynchronous / background | Pub/Sub fan-out, one message per page; Cloud Run Jobs for heavy capture |
| Heavy lifting on large datasets | Full-site crawl, N pages audited in parallel |

**Judging criteria we are optimising for:**

- *Innovation & Operational Utility (40%)* — replaces a multi-day manual audit; outputs mergeable code, not a PDF nobody actions.  
- *Architectural Discipline & Tech Stack (30%)* — decoupled services, async queue, deterministic ground truth beneath the model, verification loop, secured ingestion of untrusted input.  
- *Demo & Production Readiness (30%)* — the proxy is the demo. Live, unedited, visually obvious.

**Prize targeting:** primary Taskmaster ($20k). Secondary: Best Architectural Design ($5k), Best Multimodal UX ($5k), Honorable Mention ($2k). We are not building for the grand prize; we are building to win a category.

## 4\. Architecture

                    ┌─────────────────────┐

   Manual URL ──────▶   Intake Service     │

   Prospect list ───▶   (Cloud Run)        │

                    └──────────┬──────────┘

                               │ publish: one message per page

                    ┌──────────▼──────────┐

                    │   Pub/Sub topic     │

                    │   audit-jobs        │

                    └──────────┬──────────┘

                               │

                    ┌──────────▼──────────┐

                    │  Capture Worker     │  Playwright headless Chrome

                    │  (Cloud Run Job)    │  → DOM snapshot, screenshot,

                    └──────────┬──────────┘     computed styles → GCS

                               │

                    ┌──────────▼──────────┐

                    │  MODEL ARMOR        │  screens page content before

                    │  (ingestion guard)  │  it reaches any model

                    └──────────┬──────────┘

                               │

                    ┌──────────▼──────────────────────────┐

                    │        ADK ORCHESTRATOR             │

                    │  ┌───────────────────────────────┐  │

                    │  │ Rule Auditor (axe-core)       │  │ deterministic

                    │  ├───────────────────────────────┤  │

                    │  │ Visual Auditor (Gemini 3.5)   │  │ multimodal

                    │  ├───────────────────────────────┤  │

                    │  │ Triage (severity × impact)    │  │

                    │  ├───────────────────────────────┤  │

                    │  │ Remediator (diff generation)  │  │

                    │  ├───────────────────────────────┤  │

                    │  │ Verifier (re-run axe)         │  │ ← proof

                    │  └───────────────────────────────┘  │

                    └──────────┬──────────────────────────┘

                               │ Findings \+ patches

                    ┌──────────▼──────────┐

                    │     Firestore       │  ◀── shared contract

                    └──────────┬──────────┘

                               │

              ┌────────────────┼────────────────┐

              │                │                │

    ┌─────────▼──────┐ ┌───────▼──────┐ ┌──────▼─────────┐

    │  Proxy Service │ │  Dashboard   │ │ Report \+ Email │

    │  (Cloud Run)   │ │ (Cloud Run)  │ │ human-approved │

    │  live patched  │ │  findings UI │ │   Gmail API    │

    │  preview       │ │              │ │                │

    └────────────────┘ └──────────────┘ └────────────────┘

## 5\. Workflow — Phase by Phase

| \# | Phase | What happens | Component |
| :---- | :---- | :---- | :---- |
| 1 | **Intake** | URL arrives from a prospect list *or* manual entry. Crawler discovers pages, selects a representative sample: homepage, a form page, a nav-heavy page, a media page. Hard cap on page count. | Cloud Run \+ Pub/Sub |
| 2 | **Capture** | Headless Chrome renders each page. Full executed DOM, full-page screenshot, computed styles → Cloud Storage. | Cloud Run Job \+ Playwright |
| 3a | **Rule audit** | axe-core injected into the rendered page. Deterministic violations mapped to WCAG 2.1 AA success criteria and their RGAA equivalents. This is our ground truth. | axe-core |
| 3b | **Visual audit** | Gemini 3.5 Flash receives screenshot \+ trimmed DOM. Asked *only* for what axe structurally cannot detect. Every finding must cite a selector. | Gemini 3.5 Flash |
| 4 | **Triage** | Each finding scored: severity × user impact × remediation effort. Consequence stated in human terms — "blocks screen reader users from completing checkout", not "missing label". | ADK agent |
| 5 | **Remediation** | Granular diff per finding, isolated by CSS selector/XPath. Framework-aware where detectable (JSX attribute vs HTML attribute; Tailwind class vs raw CSS). | Gemini 3.5 Flash |
| 6 | **Verification** | Patches applied to the DOM snapshot, axe re-run. Produces the before/after count. Findings that don't verify are dropped, not shipped. | axe-core |
| 7 | **Delivery** | Proxy URL renders the live site with fixes applied. Dashboard shows findings. Report generated. Email queued **for human approval** before send. | Proxy \+ Dashboard \+ Gmail API |

### The security layer

The agent ingests arbitrary third-party web pages. That is untrusted input by definition, and a page can contain text crafted to manipulate a model that reads it — indirect prompt injection.

- **Model Armor** screens all captured page content before it reaches Gemini, blocking prompt injection, tool poisoning and PII leakage.  
- **PII redaction** on captured content before it enters the model or any report.  
- **Sandboxed rendering** — no credentials, restricted network egress, no execution of fetched code outside the browser sandbox.  
- **Audit log** of every agent action and decision, structured, to Cloud Logging.

**Demo moment:** one seeded test page contains a hidden injection string. Show the agent detecting it, refusing it, and logging it. Fifteen seconds of video, and it is the thing the judges remember.

### Outreach guards

Since audits can be triggered by prospecting rather than by the owner, three guards ship with it:

1. **Approval gate.** No email leaves the system without a human clicking send in the dashboard. This is a feature, not a limitation — say so on video.  
2. **Neutral language.** The report describes findings and fixes. It does not assert legal exposure, threaten litigation, or use urgency framing. Scare-marketing is exactly the pattern that damaged the overlay industry's reputation.  
3. **Demo safety.** The video demonstrates against a domain we control. We do not send unsolicited mail to a real third party on camera.

Include a visible opt-out line in the email template. If you target EU companies, this matters beyond politeness.

## 6\. Stack Decisions

**Google ADK, Python** — chosen over GenKit. The hackathon lists ADK first; the entire winner lineage of this hackathon series used it; its Sequential / Parallel / Loop agent primitives map directly onto the pipeline above, so orchestration is configuration rather than hand-rolled control flow; Vertex AI integration is cleanest.

**Playwright over Puppeteer** — better Python bindings, and `page.evaluate()` makes axe-core injection trivial.

**Firestore, not Cloud SQL** — no schema migration cost, and the document shape matches a Finding naturally. Speed matters more than relational integrity at this scale.

**The proxy is a separate Node/TypeScript service.** It doesn't touch ADK at all. This is deliberate: it creates a clean seam between the two workstreams below.

---

## 7\. Work Split

The whole plan depends on one thing: **agree the data contract first, then build against it independently.** Neither person waits for the other. Integration is a merge, not a negotiation.

### The contract — write this before anything else

// Firestore: audits/{auditId}

{

  "auditId": "aud\_abc123",

  "targetUrl": "https://example.com",

  "trigger": "manual" | "prospect",

  "status": "queued" | "capturing" | "auditing" | "complete" | "failed",

  "createdAt": "2026-08-29T14:00:00Z",

  "pageCount": 4,

  "violationsBefore": 47,

  "violationsAfter": 6,

  "proxyUrl": "https://proxy-xyz.run.app/aud\_abc123",

  "emailStatus": "draft" | "approved" | "sent"

}

// Firestore: audits/{auditId}/findings/{findingId}

{

  "findingId": "f\_001",

  "pageUrl": "https://example.com/contact",

  "source": "axe" | "visual",

  "wcagCriterion": "1.4.3",

  "rgaaCriterion": "3.2",

  "severity": "critical" | "serious" | "moderate" | "minor",

  "userImpact": "Screen reader users cannot identify the submit button",

  "selector": "form\#contact \> button.btn-primary",

  "xpath": "/html/body/form/button\[1\]",

  "currentCode": "\<button class=\\"btn-primary\\"\>\</button\>",

  "patchedCode": "\<button class=\\"btn-primary\\" aria-label=\\"Send message\\"\>\</button\>",

  "framework": "react" | "html" | "unknown",

  "verified": true,

  "screenshotRef": "gs://bucket/aud\_abc123/contact.png"

}

Both people code against this. Partner mocks it with fixture JSON and builds the entire frontend before the pipeline produces a single real record.

### Workstream A — Lewis (Python / ADK / Google Cloud)

Owns everything that produces data.

- GCP project setup, service accounts, Secret Manager, billing alerts  
- Intake service \+ crawler \+ Pub/Sub publisher  
- Capture worker: Cloud Run Job, Playwright, DOM \+ screenshot → GCS  
- axe-core injection and result normalisation into the Finding schema  
- ADK orchestration: the five agents  
- Gemini prompts for visual audit and remediation  
- Verification loop  
- Model Armor integration, PII redaction, audit logging  
- Firestore writes

### Workstream B — Partner (TypeScript / Node / Gemini)

Owns everything that consumes data.

- Proxy service: fetches target page, applies patches by selector, serves patched version  
- Dashboard: URL submission form, audit status, findings list, before/after counter  
- Report generation from findings  
- Email template \+ Gmail API send, behind the approval gate  
- Prospect list seeder  
- Architecture diagram (required submission artifact)

### Shared, do not duplicate

- **README with spin-up instructions** — Lewis writes backend setup, partner writes frontend setup, one file  
- **Demo video** — record together Monday  
- **Devpost write-up** — partner drafts from this document, Lewis reviews  
- **Bonus content** — one dev.to or Medium post, one LinkedIn post with `#AllThingsAgenticHackathon`

---

## 8\. Schedule

Times are relative blocks, not clock times. Adjust to your timezone; the only fixed point is submission.

### Saturday — remainder of day

**Both, together, first 45 minutes:** agree the JSON contract above, create the GitHub repo with two top-level directories (`/pipeline`, `/web`), create the GCP project. Nothing else starts until this is done.

**Lewis:** get one page end-to-end. Single URL → Playwright capture → axe runs → Findings written to Firestore → deployed to Cloud Run. Deploy today, not Monday. A pipeline that only runs locally is worth zero on the Demo criterion.

**Partner:** scaffold the dashboard against mock fixtures. Build the proxy skeleton: fetch a page, apply one hardcoded patch by selector, serve it. Prove the concept works on any site.

**End-of-day checkpoint:** Lewis has real findings in Firestore. Partner has a UI rendering fake ones. Neither has waited on the other.

### Sunday — the main build day

**Lewis, morning:** Pub/Sub fan-out for multi-page. Visual auditor with Gemini. Get the prompt producing selector-anchored findings reliably — this is the hardest prompt in the project, budget for iteration.

**Lewis, afternoon:** Triage scoring. Remediator generating real diffs. Verification loop re-running axe on patched DOM.

**Partner, morning:** Proxy applies a full patch set from Firestore. Wire dashboard to real Firestore data.

**Partner, afternoon:** Report generation. Email template and approval gate. Architecture diagram.

**Sunday evening, both:** **hard integration checkpoint.** Real audit, real findings, real proxy URL, end to end. If this doesn't work Sunday night, Monday is triage and not building.

**Lewis, Sunday late:** Model Armor \+ the seeded injection test page. This is scoped last deliberately — it's a differentiator, not a dependency.

### Monday — ship

**Morning:** bug fixes only. No new features. Seed the demo target site. Do a full dry run of the demo.

**Midday:** record the video. Multiple takes, pick the best. Finalise README and spin-up instructions.

**Early afternoon:** submit. **Target 15:00 PDT, not 17:00.** Devpost gets slow near deadlines and you do not want to discover an upload problem with twenty minutes left.

**After submitting:** publish the blog post and the LinkedIn post for bonus points.

---

## 9\. Scope — what we are NOT building

Write this list down and defend it. Every hour spent here is an hour not spent on the demo.

- No full-site crawl beyond the page cap  
- No authenticated pages  
- No GitHub PR integration  
- No CMS plugins  
- No user accounts or multi-tenancy  
- No attempt to cover all WCAG criteria — target the ten axe rules covering the majority of real violations  
- No custom design system; use a component library

## 10\. Demo Video (\~4 min)

The rules ask specifically whether the video shows *unedited, live execution* of the agent performing its task via terminal logs, database updates or UI changes, and whether there is visible proof of Google Cloud deployment.

1. **0:00–0:30 — Problem.** Legal obligation, 2,200+ lawsuits/year, manual audits cost weeks. One sentence on why overlays fail.  
2. **0:30–1:00 — Submit a URL.** Show it enter the queue. Cut to the Cloud Run / Pub/Sub console — this is your Google Cloud proof, get it on camera early.  
3. **1:00–2:00 — The agent working.** Live logs. Pages being captured, axe firing, Gemini reasoning over a screenshot. Show the injection attempt being blocked.  
4. **2:00–3:00 — The results.** Findings list with user-impact language. A real diff. Then **open the proxy: their site, fixed, live.** This is the money shot — give it room.  
5. **3:00–3:30 — The number.** 47 violations → 6, verified by re-running the rule engine.  
6. **3:30–4:00 — The approval gate.** Human reviews the report before anything sends. Close on the claim: finds, prioritises, fixes, verifies — with a human in control.

## 11\. Submission Checklist

- [ ] Category selected: Taskmaster  
- [ ] Hosted project URL  
- [ ] Text description: features, technologies, data sources, findings and learnings  
- [ ] Public repo (or private, shared with `testing@devpost.com` and `cloudhackathons@google.com`)  
- [ ] README with step-by-step spin-up instructions  
- [ ] Architecture diagram  
- [ ] \~4 min demo video with visible Google Cloud proof  
- [ ] **Bonus:** public blog/video post stating it was created for this hackathon  
- [ ] **Bonus:** social post with `#AllThingsAgenticHackathon`

## 12\. Risks

| Risk | Mitigation |
| :---- | :---- |
| Gemini returns findings without valid selectors | Validate every selector against the DOM; discard unmatched findings. Build this early. |
| Proxy breaks on JS-heavy sites | Choose demo targets that are server-rendered. Test target selection Saturday, not Monday. |
| Integration fails Sunday night | The JSON contract exists from hour one specifically to prevent this. |
| Cloud Run cold starts make the demo look slow | Pre-warm before recording. Min instances \= 1 during the demo window. |
| Running out of time | Ship order: pipeline \+ findings → proxy → verification → Model Armor → email. Cut from the bottom. |
| GCP spend | $150 credits. Gemini 3.5 Flash is cheap; Playwright in Cloud Run Jobs is the cost driver. Cap page counts. Set a budget alert Saturday. |

