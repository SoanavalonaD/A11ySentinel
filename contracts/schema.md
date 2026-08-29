# A11ySentinel — Data Contract

**Status:** draft 1, awaiting Partner sign-off.
**Authoritative.** If this file and any other document disagree, this file wins.

The pipeline **writes**. The web layer **reads**. Neither side waits for the
other — the web layer builds against `fixtures/audit-sample.json` until real
records exist.

Changing a field name here breaks the other person's build. Per `CLAUDE.md`,
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
| `status` | enum | pipeline | `queued`, `capturing`, `auditing`, `complete`, `failed` |
| `createdAt` | string | pipeline | ISO 8601 UTC, `Z` suffix. |
| `completedAt` | string or null | pipeline | Null until terminal. |
| `pageCount` | int | pipeline | Pages actually audited, not discovered. |
| `violationsBefore` | int | pipeline | Total axe violations across all pages, pre-fix. |
| `violationsAfter` | int or null | pipeline | Post-patch re-run. **Null until verification completes** — render as "pending", not as 0. |
| `proxyUrl` | string or null | **web** | Web layer writes this once the proxy can serve the audit. |
| `emailStatus` | enum | **web** | `draft`, `approved`, `sent`. Never leaves `draft` without a human click. |
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
  "rgaaCriterion": "7.1",
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
  "verified": true,
  "triageRank": 1,
  "screenshotRef": "gs://a11ysentinel-artifacts/aud_abc123/contact.png"
}
```

| Field | Type | Notes |
|---|---|---|
| `findingId` | string | `f_` + zero-padded ordinal. Stable within an audit. |
| `pageUrl` | string | The page this finding is on, not the audit target. |
| `source` | enum | `axe` or `visual` |
| `category` | string | axe rule id (`image-alt`) when `source=axe`; the screaming-snake enum (`USELESS_ALT`) when `source=visual`. |
| `wcagCriterion` | string | Dotted, no "WCAG" prefix: `1.4.3`. |
| `rgaaCriterion` | string or null | Dotted. Null where no clean RGAA mapping exists. |
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
| `verified` | bool | Set by the Verifier only. |
| `triageRank` | int or null | 1 = highest priority. Null before triage. |
| `screenshotRef` | string or null | `gs://` URI. |

---

## Invariants the web layer can rely on

These are enforced in the pipeline. Build against them.

1. **Every `selector` matches at least one element** in the captured DOM.
   Unmatched selectors are discarded, never written.
2. **`verified: false` findings are never written** to Firestore. If a finding
   is present, its patch was applied and re-checked with axe.
3. **`requiresHumanInput: true` implies `humanGuidance` is non-null** and a
   placeholder sits in `patchedCode`. The UI must surface this as *needs a
   human*, never present it as a finished fix.
4. **`confidence >= 0.7`** for every written finding.
5. **`patchedCode` is a fragment, not a document.** The proxy replaces the
   element matched by `selector`; it does not diff whole files.
6. Timestamps are **ISO 8601 UTC strings with a `Z` suffix**, never Firestore
   `Timestamp` objects — so fixtures and real data have the identical shape.

## Language rule — applies to any string rendered in the UI

Per `CLAUDE.md` rule 1: A11ySentinel **finds**, **prioritises**, **drafts**, and
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

**Open questions for you — answer these and I will fold them in:**

1. **`status` enum.** The plan stops at `capturing` / `auditing`. The real
   pipeline also remediates and verifies. Do you want `remediating` and
   `verifying` added so the dashboard can show live progress, or keep four
   states and drive a progress indicator off `pageCount`? Your UI, your call.
2. **Who writes `proxyUrl`?** I have assumed you do, once the proxy can serve
   the audit. If you would rather the pipeline pre-compute a deterministic URL,
   say so.
3. **`rgaaCriterion` nullable?** Currently nullable. If a null breaks a table
   column for you, I can emit `"n/a"` instead.
