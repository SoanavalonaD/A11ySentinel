# Handoff: A11ySentinel dashboard retheme (Solarized Light / Abyss Dark)

## Overview
A visual retheme and quality pass of the existing A11ySentinel web dashboard (Vite + React + TS +
Tailwind, source in `uploads/web/`). The information architecture and all copy are unchanged — this is
a retheme, not an IA redesign. It replaces the current glassmorphism dark build with two flat, matte,
first-class themes (Solarized Light default, Abyss Dark) and raises the visual hierarchy of the audit
summary and findings.

## About the Design Files
The files in this bundle are **design references created in HTML** (a single streaming Design Component,
`A11ySentinel Dashboard.dc.html`). They are prototypes of intended look and behavior, **not production
code to copy**. The task is to recreate them in the existing codebase — React 18 + TypeScript +
Tailwind, one component per file under `src/components/` — using its established patterns.
Practically: keep the component structure in `src/components/*.tsx` as-is and replace the class strings
/ token usage.

## Fidelity
**High-fidelity.** Exact colors, type sizes, weights, spacing, motion timings and states are specified
below and present in the HTML. Recreate closely; contrast values are correctness requirements, not
preferences (this is an accessibility product).

## Themes & tokens
Implement as CSS custom properties on a `[data-theme]` root (Tailwind: extend `theme.colors` mapping to
the vars, or `darkMode: ['class','[data-theme="dark"]']`). Two complete sets, no translucency, no blur,
no glow, no gradient page backgrounds. Radius: 0 everywhere (square corners). Borders: 1px.

### Solarized Light (default)
| Token | Value | Role |
|---|---|---|
| `--bg` | #fdf6e3 | page ground |
| `--panel` | #eee8d5 | card / panel |
| `--sunk` | #fdf6e3 | inset control surface |
| `--code` | #f6efdb | code / log surface |
| `--head` | #073642 | headings, strong text |
| `--body` / `--bodyp` | #586e75 / #576c73 | body on page / on panel |
| `--line` / `--line2` | #d3cbb7 / #93a1a1 | hairline / strong border |
| `--plate` / `--on-plate` | #073642 / #fdf6e3 | hero plate field + its ink |
| `--shade` | #073642 | shadow mix base |
| accents (fills, icons, borders, chart marks) | green #859900 · blue #4a7396 · cyan #2aa198 · yellow #b58900 · orange #cb4b16 · red #dc322f · violet #6c71c4 · magenta #d33682 | |
| `--fill-blue` / hover / `--on-fill` | #3a5f80 / #2c4b68 / #fdf6e3 | primary button |
| `--fill-yellow` / hover | #846400 / #6b5100 | human-gate button |
| accent-as-text ramp (`--c*`) | green #4e5900 · blue #2c5675 · cyan #175c57 · yellow #6d5300 · orange #9c3a11 · red #b01f1c · violet #494ea8 · magenta #9e2260 | any accent carrying words, incl. on tinted chips |

Note: the light-mode blue was deliberately shifted off canonical Solarized #268bd2 to a muted steel
(#4a7396 / #3a5f80 / #2c5675) — the canonical blue read as out of place on the warm cream ground.

### Abyss Dark
| Token | Value |
|---|---|
| `--bg` / `--panel` / `--sunk` / `--code` | #000c18 / #001c38 / #00142a / #000f1f |
| `--head` / `--body` | #e4ecfb / #a4bade |
| `--line` / `--line2` | #1f3f68 / #3d6194 |
| `--plate` / `--on-plate` / `--shade` | #062a52 / #e4ecfb / #000000 |
| accents | green #22aa44 · blue #6688cc · cyan #3fc7bd · yellow #ddbb88 · orange #f2a76c · red #ff628c · violet #9966b8 · magenta #f280d0 |
| `--fill-blue` / hover / `--on-fill` | #6688cc / #82a2e0 / #000c18 |
| `--fill-yellow` / hover | #ddbb88 / #ecca98 |
| accent-as-text (`--c*`) | green #5fd484 · blue #9dc0f2 · cyan #6fdcd2 · yellow #e9cb96 · orange #f8bd92 · red #ff9db1 · violet #c79fe4 · magenta #f9a9de |

**Rules that must survive implementation**
1. Every text/background pair ≥ 4.5:1 (≥3:1 at 24px+ / 18.66px bold and for UI boundaries). Accent text
   always from the `--c*` ramp — never a canonical accent on a light ground, and never a canonical accent
   as small text on the dark `--plate` (use `--on-plate` with the accent in the border/fill).
2. No meaning in color alone: every severity, log level and finding state carries a glyph **and** a word
   (■ Critical / ◆ Serious / ▲ Moderate / ● Minor; ⓘ INFO / ✓ SUCCESS / ▲ WARN / ✕ ERROR).
3. Focus visible everywhere: `:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }`.
4. Both themes independently checked; dark is not a skin.

## Typography
- **Chakra Petch** 600/700 — the "A11ySentinel" wordmark (19px, +0.2px tracking), the report kicker
  (13px, +1.4px, uppercase), and all large metric numerals (46px/700, −0.5px). Chosen for the
  straight-cut, non-curved `Y`.
- **Inter** 400/500/600/700 — all UI text. Body 14px/1.5; card body 12.5–14px; labels 10.5–11px/700
  uppercase with +0.5–0.6px tracking; section heads 21px/700; hero URL 34px/700 at −0.6px.
- **JetBrains Mono** 400/500/700 — code, diffs, CSS selectors, timestamps, IDs, log output, counts.

## Screens / Views
### 1. Navbar (sticky, `--panel`, 1px `--line2` bottom)
Row wraps as whole items (`flex-wrap:wrap`, `min-height:66px`); brand is `flex:1 1 300px; min-width:0`
with an ellipsised subtitle; the action cluster wraps rather than overflowing; all labels `nowrap`.
Left: 34px square shield mark (1px `--line2`, `--sunk`, Lucide shield-check at stroke 1.5, `--cblue`),
wordmark, mono pill "ADK Agent Pipeline", subtitle "Source-Level WCAG 2.1 AA / RGAA 4 Audit &
Remediation". Right: two fixture segments ("Fixture Contract (aud_7f3c91)", "Marché Antsahabe (21→4)"),
"Remediation Report", live pill "Cloud Run Active" (7px dot + expanding pulse ring, 1.8s), and the
**theme switcher**: a two-segment sun/moon control, always labelled Light/Dark in text; selected segment
is a solid `--fill-blue` fill with `--on-fill` ink, unselected is transparent with `--body`.
A second row holds the view tabs (Dashboard / Remediation Report / Component Sheet), active = 2px
`--blue` underline + `--head` label.

### 2. Dashboard
- **Audit form** panel: URL input (mono 13px, `--sunk`, 1px `--line2`), primary "Audit Site"
  (`--fill-blue`), three option checkboxes in a 3-up grid (Multimodal Visual Audit / Patch Generation &
  Verification / User Impact Triage) each with a mono sub-label, then the Integrity Guardrail note as a
  2px `--cyan` left-rule paragraph.
- **Live pipeline** (only while running): 6 equal cells — DONE cells tinted green with check icon,
  RUNNING cell tinted blue with a 2px bar sweeping (`a11bar`, 1.6s linear), QUEUED cells `--sunk` with a
  dashed circle. Each cell: state word in mono 10px/700 + step name 12.5px/600.
- **Audit summary (hero)**: header sits on a solid `--plate` field with a 56px blueprint grid
  (`--on-plate` at 6%) and a 34%-wide steel sweep (`a11sweep`, 7s). Mono metadata row (Audit ID,
  timestamp, "EMAIL: DRAFT — NOT SENT" badge = `--on-plate` ink, yellow border + 22% fill), kicker
  "Audit target", URL at 34px reversed out, then three actions (Generate Report primary; Email Report
  (Human Gate) yellow-bordered; Preview Corrected Site (Live Proxy) cyan-bordered — both cream ink on
  the plate with a 20% accent fill, 34% on hover).
  Below on `--panel`: 4-cell metric grid split by 1px `--line` — Measured axe-core Violations
  (46px `--cred` **47** struck through 3px, arrow, 46px `--cgreen` **6**, chip "−87% violations"),
  Verified Fixes 41, Action Required 3 (yellow-tinted cell, 2px `--yellow` top border), Pages Audited 4.
  Numerals count up from 0 over 950ms, ease-out cubic. Footer strip on `--sunk`: the claim-discipline line.
- **Filter bar**: 4 tabs with mono counts (44 / 41 / 6 / 3), active = `--fill-blue` fill; Severity and
  Source selects; search field with leading Lucide search icon.
- **Findings**: section head ("Evidence" kicker / "Findings" 21px / mono "sorted by triage rank · showing
  3 of 44") over a 2px `--head` rule. Cards are 1px `--line2` on `--panel` with
  `box-shadow: 0 8px 24px color-mix(in srgb, var(--shade) 9%, transparent)`, entering staggered
  (`a11rise` 0.55s cubic-bezier(.2,.7,.2,1), 0.04/0.11/0.18s) and lifting `translateY(-2px)` with a
  deeper shadow on hover (0.18s ease). **No left status rails.** State is a full-width tinted status band
  at the top of each card: 16% accent tint on `--panel`, 45%-accent bottom border, icon + label in the
  `--c*` ink at 13px/700, and on the right a highlighted number plate — "FINDING" 10px/700 uppercase,
  then `01` in Chakra Petch 15px on a solid `--plate` block, then the mono `f_001` reference.
  Three states, all present:
  1. **Verified Patch** (green band): source/severity/category chips, WCAG + RGAA chips, user-impact
     sentence, the cyan **Screen Reader Announcement (Chromium CDP)** block (1px `--cyan`, 10% tint, a
     4-bar equaliser animating `a11eq` 1.1s staggered 0.18s, Before/After panels on `--sunk` with red /
     green borders, mono 13px), the verified diff (red-tinted − Original / green-tinted + Verified Patch
     over `--code`, mono 12.5px, change-summary quote in `--cgreen`), and the CSS-selector row + Copy.
  2. **Detected Violation — no patch** (red band): same header, user impact, selector, and a dashed-red
     "No patch on this finding" block. No diff, no fix, unmistakably.
  3. **Action Required — human input** (yellow band): card surface 5% yellow tint; diff whose added line
     is labelled "+ Draft patch — contains placeholder" with `TODO: describe this image` in a `<mark>`
     at 42% yellow; then a yellow review block with "Requires human review" + "View editing guidance"
     button (opens the Human Guidance modal) and the guidance paragraph.
- **Agent Audit Logs**: terminal-flavoured. Header with terminal icon + Copy log; filter row with the
  seven agent chips (RootOrchestrator, RuleAuditor, VisualAuditor, TriageAgent, RemediationFanOut,
  Remediator, Verifier), a level select and a search field; stream on `--code` as a
  `74px 150px 86px 1fr` grid per row (mono timestamp, bordered agent chip, level badge in its `--c*` ink
  with a 55% border, message in Inter 12.5px + mono details line); a blinking caret row
  ("stream idle · awaiting next pipeline event", `a11blink` 1.1s step-end); then two `<details>`
  sections — "Agent Discards & Notes (3)" and "Verifier Write-Gate Rejections (1)".

### 3. Remediation Report (document view, 920px column)
Back to Dashboard / Download Markdown (.md) / Print / Save as PDF, then a paper-like `--panel` article
with 44–52px padding: kicker + 32px title over a 2px `--head` rule, a 3-cell metadata grid (Target URL,
Audit Date, Pages Scanned), then numbered sections — 1 Measured summary (table: 47→6, 41 verified, 3
human), 2 Verified source patches, 3 Action required items (yellow), 4 Standards & engines, 5 Claim
discipline & responsible use.

### 4. Email Approval modal (the human gate)
Backdrop = `--head` at 55%. 660px panel: kicker "Human gate · nothing sends automatically", title,
recipient + subject fields, a rendered email preview on `--sunk` (with the mandatory unsubscribe line in
the footer), three cyan reassurance lines with check icons, an explicit approval checkbox on a yellow
block, and "Approve & Send Email" — **disabled (55% opacity, not-allowed) until the checkbox is ticked**,
then a solid `--fill-yellow` fill.

### 5. Human Guidance modal
620px panel: the generated patch with the highlighted `TODO:` placeholder, "Why the model stopped"
(inventing a description would be worse than the violation), "What to supply" (3 rules), an alt-text
textarea, and "Save alt text & re-verify".

### 6. Component sheet
Theme switcher in both states plus a focused state; buttons (primary / secondary / ghost / human gate /
focused primary / focused secondary / disabled at 45%); severity and log-level chips with glyphs; form
fields default / focused / invalid.

## Interactions & Behavior
- Theme toggle sets `data-theme` on the root; persist to `localStorage` and honour
  `prefers-color-scheme` on first load (the prototype defaults to light).
- View switch: dashboard / report / component sheet. Modals: email, guidance (Esc + backdrop close, focus
  trap, return focus to the invoking button — the prototype does not implement the trap; production must).
- "Audit Site" toggles the live pipeline panel (in production, drives real pipeline state).
- Filter tabs, severity/source selects and search filter the findings list.
- Motion: `a11rise` (card entry), `a11sweep` (plate, 7s), `a11eq` (announcement bars, 1.1s),
  `a11blink` (log caret, 1.1s), `a11pulse` (live dot, 1.8s), `a11bar` (pipeline, 1.6s), counters 950ms
  ease-out. All wrapped in `@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}`
  with counters landing on their final values.

## State Management
`theme` ('light'|'dark'), `view`, `running`, `tab` (1–4), `modal` (null|'email'|'guidance'),
`approved` (gates the send button), `fixture` ('a'|'b'), plus the counter progress value. Data shape is
unchanged from `src/types/schema.ts` and `src/data/sampleFixture.ts`.

## Spacing & shape
4px base: 4 / 7 / 10 / 12 / 14 / 18 / 20 / 26 / 34 / 44. Page column max 1280px (report 920px), gutters
24px. Border radius **0**. Shadows only the two card/hero mixes above; nothing else is elevated.

## Assets
No images. All icons are inline Lucide paths at stroke-width 1.5 (shield-check, sun, moon, cpu,
sparkles, check-circle, shield-alert, user-check, volume-2, code, eye, copy, file-text, file-code,
search, layers, terminal, mail, printer, download, alert-triangle, x, scan). Fonts from Google Fonts:
Chakra Petch, Inter, JetBrains Mono.

## Files
- `A11ySentinel Dashboard.dc.html` — the current design (all screens, both themes, all states).
- `A11ySentinel Dashboard v2 (static).dc.html` — same design before the motion pass.
- `A11ySentinel Dashboard v1 (left-rail cards).dc.html` — earlier version with colored left rails on
  finding cards and a non-plate summary header (revert reference).
