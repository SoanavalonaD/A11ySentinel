# A11ySentinel — Data Contract

**Status:** draft 7, awaiting Partner sign-off.
Draft 2 added `status`. Draft 3 added `announcedBefore` / `announcedAfter`.
**Draft 4 renames `rgaaCriterion`** — see "Standards" below. That one is a
breaking change; the others were additive.
**Draft 5 adds `remediating` and `verifying`** to the audit `status` enum,
answering open question 1. Additive.
**Draft 6 adds `auditLogs`** to the audit response. Additive.
**Draft 7 writes the response envelope down** — section 3. It documents
`auditLogs`, `notes` and `write`, which were already being returned but were
never in this file, and adds `emailDraft` from Agent 8. Additive, and nothing
in the envelope is persisted to Firestore.
**Authoritative.** If this file and any other document disagree, this file wins.

The pipeline **writes**. The web layer **reads**. Neither side waits for the
other — the web layer builds against `fixtures/audit-sample.json` until real
records exist.

Changing a field name here breaks the other person's build. Per `CONTRIBUTING.md`,
contract changes go **straight to `main`** with a message to the other person,
never inside a feature branch.

---

## Firestore layout

```
audits/{auditId}                        <- one document per audit run
audits/{auditId}/findings/{findingId}   <- subcollection, one doc per finding
```

---

## 1. Audit document — `audits/{auditId}`

```json
{
  "auditId": "aud_abc123",
  "targetUrl": "https://example.com",
  "trigger": "manual",
  "status": "complete",
  "createdAt": "2026-08-29T14:00:00Z",
  "completedAt": "2026-08-29T14:03:12Z",
  "pageCount": 4,
  "violationsBefore": 47,
  "violationsAfter": 6,
  "proxyUrl": "https://proxy-xyz.run.app/aud_abc123",
  "emailStatus": "draft",
  "error": null
}
```

| Field | Type | Written by | Notes |
|---|---|---|---|
| `auditId` | string | pipeline | `aud_` + 6 hex. Also the Firestore doc id. |
| `targetUrl` | string | pipeline | Absolute URL, scheme included. |
| `trigger` | enum | pipeline | `manual` or `prospect` |
| `status` | enum | pipeline | `queued`, `capturing`, `auditing`, `remediating`, `verifying`, `complete`, `failed`. **Written as it advances**, not only at the end — poll the audit document for live progress. |
| `createdAt` | string | pipeline | ISO 8601 UTC, `Z` suffix. |
| `completedAt` | string or null | pipeline | Null until terminal. |
| `pageCount` | int | pipeline | Pages actually audited, not discovered. |
| `violationsBefore` | int | pipeline | Total axe violations across all pages, pre-fix. |
| `violationsAfter` | int or null | pipeline | Post-patch re-run. **Null until verification completes** — render as "pending", not as 0. |
| `proxyUrl` | string or null | **pipeline** | Pipeline writes `/proxy/{auditId}` upon audit completion once the proxy can serve the audit. |
| `emailStatus` | enum | **web** | `draft`, `approved`, `sent`. Never leaves `draft` without a human click. **`approved` means a human signed off and nothing was dispatched** — it is the resting state while no mail transport is configured. `sent` is written only when a transport confirms delivery, so it is never a guess. |
| `error` | string or null | pipeline | Human-readable reason when `status = failed`. |

**`violationsBefore` to `violationsAfter` is the demo centrepiece.** Both are
counts of *verified* axe violations, so the numbers are defensible on camera.

---

## 2. Finding document — `audits/{auditId}/findings/{findingId}`

```json
{
  "findingId": "f_001",
  "pageUrl": "https://example.com/contact",
  "source": "axe",
  "category": "button-name",
  "wcagCriterion": "4.1.2",
  "regionalFramework": "RGAA 4",
  "regionalCriterion": "7.1",
  "severity": "critical",
  "userImpact": "Screen reader users hear only 'button' and cannot tell what it does.",
  "evidence": null,
  "selector": "form#contact > button.btn-primary",
  "xpath": "/html/body/form/button[1]",
  "currentCode": "<button class=\"btn-primary\"></button>",
  "patchedCode": "<button class=\"btn-primary\" aria-label=\"Send message\"></button>",
  "changeSummary": "Added an accessible name to the submit button.",
  "requiresHumanInput": false,
  "humanGuidance": null,
  "framework": "html",
  "confidence": 0.97,
  "status": "verified",
  "verified": true,
  "triageRank": 1,
  "screenshotRef": "gs://a11ysentinel-artifacts/aud_abc123/contact.png",
  "announcedBefore": "button: (nothing — announced only as its type)",
  "announcedAfter": "button: \"Send message\""
}
```

| Field | Type | Notes |
|---|---|---|
| `findingId` | string | `f_` + zero-padded ordinal. Stable within an audit. |
| `pageUrl` | string | The page this finding is on, not the audit target. |
| `source` | enum | `axe` or `visual` |
| `category` | string | axe rule id (`image-alt`) when `source=axe`; the screaming-snake enum (`USELESS_ALT`) when `source=visual`. |
| `wcagCriterion` | string | Dotted, no "WCAG" prefix: `1.4.3`. |
| `regionalFramework` | string or null | Regional framework likely to apply, named as context. Null when no signal is strong enough. **Never a legal determination.** |
| `regionalCriterion` | string or null | Equivalent criterion under that framework. Populated only for frameworks we hold a verified mapping for — currently RGAA only. |
| `severity` | enum | `critical`, `serious`, `moderate`, `minor` |
| `userImpact` | string | Plain-language consequence for a person. **Never a restatement of the rule.** |
| `evidence` | string or null | What the model saw. Populated when `source=visual`, null for `axe`. |
| `selector` | string | CSS. **Guaranteed to match at least one element** in the captured DOM — validated in code before write. |
| `xpath` | string or null | Fallback anchor for the proxy when the selector is ambiguous. |
| `currentCode` | string | Exact original snippet, unmodified. |
| `patchedCode` | string or null | Null until the Remediator has run. |
| `changeSummary` | string or null | One sentence, under 15 words. |
| `requiresHumanInput` | bool | True when the fix needs knowledge the model does not have. |
| `humanGuidance` | string or null | Non-null **if and only if** `requiresHumanInput` is true. |
| `framework` | enum | `react`, `html`, `unknown` |
| `confidence` | float | 0.0 to 1.0. Findings below 0.7 are discarded before write. |
| `status` | enum | `detected`, `patched`, `verified`. See the lifecycle below. **This is the field the UI should branch on.** |
| `verified` | bool | Set by the Verifier only, and only about a patch. Equivalent to `status == "verified"`; kept because the plan's original contract named it. |
| `triageRank` | int or null | 1 = highest priority. Null before triage. |
| `screenshotRef` | string or null | `gs://` URI. |
| `announcedBefore` | string or null | What assistive technology announced for this element before the fix. |
| `announcedAfter` | string or null | What it announces after. **Always null together with `announcedBefore`** — see below for when. |

---

## 3. Response envelope — `POST /audit`, not persisted

Firestore holds two things: the audit document and its findings subcollection.
The `/audit` response carries those **plus four keys that are not stored
anywhere.** They describe how one run went, so they belong to the response, not
to the record.

```json
{
  "audit": { ... },
  "findings": [ ... ],
  "notes": ["VisualAuditor: discarded `div > span.badge` — DOM match count 0"],
  "auditLogs": [ { "logId": "log_aud_abc123_004", "agentName": "TriageAgent", "level": "info", ... } ],
  "write": { "findingsWritten": 41, "findingsRejected": [] },
  "emailDraft": { ... }
}
```

| Key | Type | Notes |
|---|---|---|
| `notes` | string[] | Human-readable decision trail. What a report quotes. |
| `auditLogs` | object[] | The same events with `agentName`, `level` and `stage` kept separate, so the UI can filter. Emitted from the same call site as `notes`, so the two cannot drift. |
| `write` | object or absent | Present only when `PERSIST_TO_FIRESTORE` is on. Carries `findingsWritten` and `findingsRejected`. |
| `emailDraft` | object or null | Agent 8's output. Null when the agent did not run. |

`auditLogs[].agentName` is one of the **eight** agent names: `RootOrchestrator`,
`RuleAuditor`, `VisualAuditor`, `TriageAgent`, `RemediationFanOut`,
`Remediator`, `Verifier`, `OutreachDrafter`. `level` is one of `info`,
`success`, `warn`, `error`.

### `emailDraft` — Agent 8, the OutreachDrafter

Written only when the request sets `draftEmail: true`. It is **a proposal, not
a message.** The human approval gate in the dashboard is unchanged and is still
the only thing that can send anything.

```json
{
  "drafted": true,
  "modelUsed": true,
  "opening": "We ran an automated accessibility audit on your site without being asked, and wanted to share what it found.",
  "highlights": [
    {
      "findingId": "f_001",
      "sentence": "Someone using a screen reader reaches your contact form and hears only 'button', with no way to tell what it does."
    }
  ],
  "closing": "The full report is below if it is useful to you.",
  "language": "fr",
  "reason": null,
  "screened": "Model Armor screened 3 text blocks: no prompt injection or malicious content detected"
}
```

| Field | Type | Notes |
|---|---|---|
| `drafted` | bool | **Branch on this.** False means "use the static template" — a normal outcome, not an error. |
| `modelUsed` | bool | False whenever `drafted` is false. |
| `opening` | string or null | One or two sentences. Null when `drafted` is false. |
| `highlights` | array | At most 3. Each `findingId` is **guaranteed to exist** in this audit's findings — ungrounded ones are dropped before the response is built. |
| `closing` | string or null | One sentence. |
| `language` | string or null | The audited page's language. The narrative is written in it. |
| `reason` | string or null | Non-null **if and only if** `drafted` is false. Says why — model failure, an ungrounded highlight, or a claim-discipline refusal. |
| `screened` | string or null | What Model Armor said about the input, or why it was not consulted. |

**What the model does not write, and the web layer must keep templating:**
the metrics, every link, the claim-discipline notice, the opt-out footer and
the subject line. Those carry claims, so they are never model output. Agent 8
writes prose and nothing else.

**`drafted: false` is common and expected.** Any of these produce it, and in
every case the correct behaviour is to send the existing static template:

1. The model call failed or returned malformed JSON.
2. No highlight cited a `findingId` we actually supplied.
3. The draft broke claim discipline — it mentioned compliance, liability,
   litigation, a penalty, a deadline, a guarantee, or claimed the site is now
   fixed. Such a draft is **discarded whole**, never partially used.

So: **never render `emailDraft` fields without checking `drafted` first**, and
never fall back to showing `reason` to a recipient — it is diagnostic text for
the dashboard, not email copy.

---

## Standards — what we measure, and what we merely name

**We measure WCAG 2.1 A/AA. Always, everywhere, for every site.** That is the
global standard, and every regional framework below either adopts it or
references it directly. The rule engine runs on WCAG tags only:

```python
"runOnly": {"type": "tag", "values": ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]}
```

`regionalFramework` does **not** change what is audited. It names the framework
that most likely applies to a site, so a French public body sees RGAA
referenced and a US federal agency sees Section 508 — the same findings, a
familiar label.

It is inferred from page metadata: the `lang` attribute, the TLD, and
`hreflang` alternates. Which law actually binds a site depends on who operates
it, where they are established and what sector they are in — none of which is
knowable from a web page. So the inference is deliberately conservative and
returns null rather than guess:

| Signals | Result |
|---|---|
| `.fr` domain + `lang="fr"` | `RGAA 4`, confidence 0.75 |
| `lang="fr-CA"` | `AODA` — French does not imply France |
| `lang="fr"`, neutral TLD | **null** — too weak to name |
| `.be` + `lang="nl-BE"` | `EN 301 549`, confidence 0.95 |
| no signal | **null** |

**Language is not jurisdiction.** A French-language page may be Canadian,
Belgian, Swiss or Malagasy, and the detector is built around that.

`regionalCriterion` carries a criterion number **only for frameworks we hold a
verified mapping for — currently RGAA alone.** Others are named with no number,
because naming a framework is a factual cross-reference while inventing a
criterion number would be fabrication (hard rule 5).

### How to word this in the UI

Say: *"WCAG 1.1.1 — the equivalent criterion under RGAA 4 is 1.3."*

Never: *"RGAA compliant"*, *"meets EN 301 549"*, or anything asserting which
law applies to a site. Naming a likely framework is context. Asserting legal
conformance is the claim that cost accessiBe $1M.

## `auditLogs` — the agent decision trail

Returned alongside `audit` and `findings` on the API response. Each entry is
one thing an agent did, and how it went.

```json
{
  "logId": "log_aud_9d0ca3_007",
  "timestamp": "2026-08-30T18:22:41Z",
  "agentName": "VisualAuditor",
  "level": "error",
  "message": "Suspicious content in page - reported, not obeyed",
  "details": "Text contains 'IGNORE ALL PREVIOUS INSTRUCTIONS...'",
  "stage": "auditing"
}
```

| Field | Notes |
|---|---|
| `logId` | `log_<auditId>_<NNN>`. Sequential, so order is recoverable from the id and a replay produces the same ids. |
| `agentName` | One of the seven agents. |
| `level` | `info`, `success`, `warn`, `error`. `success` is distinct from `info`: a verified fix and a routine step are both non-failures, but only one is an achievement. |
| `message` | One line, safe to show as-is. |
| `details` | Longer context. Null when there is none. |
| `stage` | The audit status it happened during, for grouping. |

**This is the same information as `notes`, in two forms.** `notes` stays
human-readable prose for the report; `auditLogs` keeps agent, level and stage
separate so the UI can filter and colour. Both are emitted from the same call
site, so they cannot drift — the strings are never parsed back into structure.

The trail is where refusals become visible: a patch declined because it
introduced a new violation, a page passage flagged as an injection attempt and
reported rather than obeyed, personal data removed before the model saw it.
Those are the pipeline's most defensible moments and they are otherwise silent.

## Finding lifecycle — `status`

A finding moves through three states. The distinction matters because
"we found a real violation" and "we checked our fix for it" are different
claims, and conflating them is how a tool ends up showing an unchecked fix as
though it were done.

| `status` | Means | `patchedCode` | `verified` | May the UI show it? |
|---|---|---|---|---|
| `detected` | A real violation, confirmed by axe or by a validated visual finding. No fix drafted yet. | `null` | `false` | **Yes** — as a finding. Never as a fix. |
| `patched` | A fix was drafted but has not survived verification. | set | `false` | **No.** Transient, internal to the pipeline. |
| `verified` | Fix applied to the DOM, axe re-run, original violation gone, nothing new introduced. | set | `true` | **Yes** — as a finding and as a fix. |

`detected` is what Stage 1 produces: real violations, honestly counted, no
fixes claimed. It is what makes the dashboard useful before the Remediator
exists.

**A `patched` finding must never be rendered or served by the proxy.** It is a
draft that failed or has not yet been checked. This is hard rule 3 restated
precisely: the rule protects against showing an unverified **fix**, not
against reporting a detected **violation**.

## `announcedBefore` / `announcedAfter` — the visible before/after

Almost every fix this tool makes is **invisible on screen**. `alt`,
`aria-label` and `lang` change no pixels, so a side-by-side screenshot of a
patched page shows two identical images. Presenting that as the result would be
unconvincing, and arguably misleading.

The change is real; it is just not in the rendering. It is in the accessibility
tree — the structure a screen reader walks. These two fields carry it:

```json
"announcedBefore": "link: (nothing — announced only as its type)",
"announcedAfter":  "link: \"Home\""
```

Both strings are **measured, not predicted.** They are read from Chromium's own
accessibility tree via CDP, computed by the same algorithm the browser uses for
a real screen reader, against the actual patched DOM.

**Render these as the headline before/after.** They are the honest visual
representation of what the tool did, and they carry the point better than a
code diff does for anyone who does not read HTML.

**The two fields are always both set or both null.** They are null in three
cases, and in every one of them the right thing to render is nothing at all:

1. **The element carries no announced role.** `<html>` has none, so an
   `html-has-lang` fix has no announcement to show.
2. **No patch was applied** — a `detected` finding has no "after" to compare
   against, and a rejected patch's "before" is discarded with it.
3. **The announcement did not change.** The fix can still be real: a
   `PLACEHOLDER_AS_LABEL` fix adds a persistent `<label>`, which helps someone
   who has already started typing, but the computed accessible name was
   coming from the placeholder and is identical either way. The improvement is
   genuine; the accessibility tree is simply not where it shows.

Case 3 is why the pipeline filters rather than leaving you to. Rendering
`before: X / after: X` side by side reads as "nothing happened", which is worse
for the report than showing nothing — the finding still carries its diff, its
`changeSummary` and its `userImpact`.

So: **if `announcedBefore` is null, skip the announcement row entirely.** Never
render a null as an empty string, and never fill one in.

## Invariants the web layer can rely on

These are enforced in the pipeline. Build against them.

1. **Every `selector` matches at least one element** in the captured DOM.
   Unmatched selectors are discarded, never written.
2. **A finding carrying `patchedCode` is only ever shown when
   `status == "verified"`.** Findings at `detected` are written and displayed
   as violations with no fix attached. Findings at `patched` are never shown
   and never served by the proxy.
3. **`requiresHumanInput: true` implies `humanGuidance` is non-null** and a
   placeholder sits in `patchedCode`. The UI must surface this as *needs a
   human*, never present it as a finished fix.
4. **`confidence >= 0.7`** for every written finding.
5. **`patchedCode` is a fragment, not a document.** The proxy replaces the
   element matched by `selector`; it does not diff whole files.
6. Timestamps are **ISO 8601 UTC strings with a `Z` suffix**, never Firestore
   `Timestamp` objects — so fixtures and real data have the identical shape.

## Language rule — applies to any string rendered in the UI

Per `CONTRIBUTING.md` rule 1: A11ySentinel **finds**, **prioritises**, **drafts**, and
**verifies**. Nothing in this schema ever supports the claim that a site is
"compliant" or "fixed". `violationsAfter` is a measured count, not a grade.

---

## Deltas from the plan document — Partner, please review

`docs/A11ySentinel-Project-Plan.md` carries the original contract. I added
fields that the already-written Gemini prompts produce, so nothing here is
invented:

| Added | Why |
|---|---|
| `category` | The VisualAuditor prompt returns it; needed to group findings in the UI. |
| `evidence` | VisualAuditor prompt returns it. Good report copy. |
| `changeSummary` | Remediator prompt returns it. The one-line diff caption. |
| `requiresHumanInput`, `humanGuidance` | Remediator prompt returns both. **Hard rule 5 depends on these reaching the UI.** |
| `confidence` | Both prompts return it. Drives the 0.7 discard threshold. |
| `triageRank` | TriageAgent output needs somewhere to land. |
| `completedAt`, `error` | The dashboard needs to show duration, and to explain a failure. |
| `status` | **Added draft 2 — please read.** See below. |

### Why `status` was added (draft 2)

Draft 1 said `verified: false` findings are never written. Running Stage 1
against a real page showed that this cannot be right: with no Remediator yet,
every finding is `verified: false`, so nothing could be written at all and
your dashboard would be empty until the Remediator lands.

The word `verified` was doing two jobs — "this violation is real" and "this
fix was checked". `status` separates them. Hard rule 3 is unchanged and
fully intact: **an unverified fix is still never shown or served.** What
changed is that a detected violation with no fix attached can now be
reported, which is exactly what Stage 1 produces.

**What this means for your UI:** branch on `status`, not on `verified`.
A `detected` finding renders as "we found this" with no diff. Only a
`verified` finding renders a diff.

**Open questions for you — answer these and I will fold them in:**

1. ~~**`status` enum.**~~ **Answered — added in draft 5.** You had already
   put `remediating` and `verifying` in your TypeScript, so the pipeline now
   emits them. It also **writes each transition to Firestore as it happens**
   rather than only at the end, which is what makes them observable: an audit
   spends about a second capturing and a minute drafting and checking patches,
   so without this it would look stalled on `auditing` and then jump to
   `complete`. Poll the audit document to drive the progress tracker.
2. **Who writes `proxyUrl`?** I have assumed you do, once the proxy can serve
   the audit. If you would rather the pipeline pre-compute a deterministic URL,
   say so.
3. **`regionalCriterion` nullable?** Currently nullable, and null far more often
   than `rgaaCriterion` was — we populate it only for frameworks with a
   verified mapping, which today means RGAA alone. `regionalFramework` is often
   set while `regionalCriterion` is null; that pairing is expected, not a bug.
   If a null breaks a table column for you, say so.

4. **`emailDraft` is not persisted (draft 7).** It rides on the `/audit`
   response only, so a dashboard that reloads from Firestore loses it and
   falls back to the static template. That is safe but lossy. If you want the
   approver to be able to come back to a drafted email in a later session,
   say so and I will add it to the audit document.

5. **Draft 4 renamed `rgaaCriterion`.** It is the only breaking change so far.
   If you had a column bound to it, it is now two fields. Sorry for the churn —
   we moved to WCAG-first framing, and a field named after one country's
   framework did not survive that.
