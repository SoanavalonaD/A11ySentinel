# A11ySentinel — Web Layer Verification Guide (Workstream B)

This document provides a comprehensive checklist to verify all frontend, dashboard, and proxy service deliverables in the `web/` directory.

---

## 1. Web Dashboard (Deliverable B1)

### 1.1 Navigation & Preset Selection
- [ ] **Navbar Branding**: Displays A11ySentinel title, ADK Agent Pipeline badge, and Cloud Run service status indicator (`https://a11ysentinel-pipeline-708226575684.us-central1.run.app/health`).
- [ ] **Fixture Preset Buttons**:
  - Clicking **"Fixture Contract (aud_7f3c91)"** loads the authoritative fixture from `contracts/fixtures/audit-sample.json`.
  - Clicking **"Marché Antsahabe (21→4)"** loads the demo site audit dataset.

### 1.2 Audit Form & Options
- [ ] **Target URL Input**: Accepts any valid HTTP/HTTPS URL.
- [ ] **Presets Shortcuts**: Quick buttons for *Marché Antsahabe* and *WAI Before Demo*.
- [ ] **Pipeline Switches**: Toggles for *Multimodal Visual Audit*, *Patch Generation & Verification*, and *User Impact Triage*.
- [ ] **Integrity Guardrail Banner**: Explicitly states that fixes are source-level code diffs, not runtime overlays.

### 1.3 Live Pipeline Progress Tracker
- [ ] **Stage Monitor**: Displays active step progress (`queued` → `capturing` → `auditing` → `remediating` → `verifying` → `complete`).

### 1.4 Audit Summary & Metrics Header
- [ ] **Before / After Counter**: Displays measured violations before (`violationsBefore`) and after (`violationsAfter`), along with reduction percentage (e.g., `47 → 6 (-87%)`).
- [ ] **Verified Fixes Badge**: Displays count of patches confirmed by axe-core re-run.
- [ ] **Action Required Badge**: Displays count of items with `requiresHumanInput: true`.
- [ ] **Proxy Preview Link**: CTA button opening the live proxy route (`/proxy/${auditId}`).
- [ ] **Claim Discipline Disclaimer**: States *Finds, prioritises, drafts, and verifies fixes under human review*, avoiding arbitrary grades or compliance claims.

### 1.5 Filter & Search Bar
- [ ] **Status Tabs**:
  - **All Findings**: Shows all valid findings.
  - **Verified Fixes**: Filters for `status === "verified"`.
  - **Detected Violations**: Filters for `status === "detected"`.
  - **Action Required**: Filters for `requiresHumanInput === true`.
- [ ] **Severity Filter**: Dropdown for `All`, `Critical`, `Serious`, `Moderate`, `Minor`.
- [ ] **Source Filter**: Dropdown for `All`, `axe-core`, `VisualAuditor`.
- [ ] **Search Bar**: Filters findings in real-time by rule category, CSS selector, or user impact text.

### 1.6 Finding Cards & Hard Rules Verification
- [ ] **Hard Rule 1 (Status Branching)**:
  - Findings with `status === "verified"` show the code diff viewer (`currentCode` vs `patchedCode`) and change summary.
  - Findings with `status === "detected"` show the finding details **without** a code diff.
  - Findings with `status === "patched"` are **never rendered**.
- [ ] **Hard Rule 2 (Human Input Required)**:
  - Findings with `requiresHumanInput: true` display a prominent amber "Action Required" badge, explanation banner, and button opening the **Editorial Guidance Modal**.
  - Never displayed as a finished fix.
- [ ] **Screen Reader Announcement Headline (Draft 3)**:
  - If `announcedBefore` is non-null, renders the computed accessible name comparison (*Before Patch* vs *After Patch*).
  - If `announcedBefore` is null, the announcement row is omitted completely.
- [ ] **Criteria Badges**: Displays WCAG criterion badge (e.g., `WCAG 1.1.1`) and regional framework cross-reference badge (e.g., `RGAA 4 1.3`) when present.
- [ ] **Selector & XPath**: Displays copyable CSS selector and XPath string.

---

## 2. Proxy Service (Deliverable B2)

### 2.1 Proxy Engine & Selector Replacement
- [ ] **Verified Patches Only**: ONLY findings with `status === "verified"` and valid `patchedCode` are applied to the DOM tree. Unverified findings (`detected` or `patched`) are left untouched.
- [ ] **DOM Replacement by Selector**: Element matched by `finding.selector` is replaced with `finding.patchedCode` using `node-html-parser`.
- [ ] **Live Preview Header Banner**: Injects `#a11ysentinel-proxy-banner` at the top of `<body>`:
  - Displays count of verified source patches applied live.
  - Displays disclaimer: *(Source diff preview — Not a runtime overlay script)*.
  - Includes a link button returning to the Dashboard.

### 2.2 Dev & Standalone Routes
- [ ] **Vite Dev Server Middleware**: Route `/proxy/:auditId` and `/api/proxy` accessible directly on `http://localhost:3000/proxy/...` during `pnpm run dev`.
- [ ] **Standalone Proxy Server**: Running `ts-node src/server/standaloneProxy.ts` launches standalone Node HTTP server on port 3001.

---

## 3. Remediation Report Generation (Deliverable B3)

### 3.1 Structured Content & Claim Discipline
- [ ] **Neutral Language**: Contains no arbitrary compliance grades or legal claims ("100% compliant", "legally risk-free").
- [ ] **Executive Summary**: Displays audit ID, date, scanned pages count, and exact `violationsBefore` → `violationsAfter` measured reduction.
- [ ] **Technical Scope**: References primary WCAG 2.1 AA standard and contextual RGAA 4 framework.
- [ ] **Verified Source Fixes Section**: Lists all `verified` findings with WCAG/RGAA tags, CSS selector, screen reader announcement comparison, and code diffs (`currentCode` vs `patchedCode`).
- [ ] **Human Action Required Section**: Dedicated section for `requiresHumanInput: true` items with `humanGuidance` and placeholder notice.
- [ ] **Unpatched Violations Section**: Displays detected violations awaiting remediation.

### 3.2 Export & Print Features
- [ ] **Print / Save as PDF**: Clicking **"Print / Save as PDF"** opens browser print dialog (`window.print()`) with print-optimized styles.
- [ ] **Download Markdown (.md)**: Clicking **"Download Markdown (.md)"** downloads `A11ySentinel_Remediation_Report_${auditId}.md`.

## 4. Email + Approval Gate (Deliverable B4)

### 4.1 Human Approval Gate
- [ ] **Initial State**: `emailStatus` starts as `"draft"`. No email is ever sent automatically upon audit completion.
- [ ] **Approval Modal**: Clicking **"Email Report (Human Gate)"** in `AuditSummary` opens the `EmailApprovalModal`.
- [ ] **Mandatory Confirmation Checkbox**: The **"Approve & Send Email"** button is disabled until the human user checks *"I have reviewed the email copy... and explicitly approve sending this audit report"*.
- [ ] **State Transition**: Successfully dispatching the email transitions `emailStatus` from `"draft"` to `"sent"`, updating the UI badge to `Email: sent`.

### 4.2 Neutral Language & Outreach Guards
- [ ] **Neutral Copy**: Contains no legal threats, urgency framing, or scare marketing. Describes findings, user impact, and verified patches.
- [ ] **Visible Opt-Out Line**: Includes mandatory footer line (*"If you prefer not to receive accessibility audit reports for domain, click here to opt out"*).

## 5. Architecture Diagram (Deliverable B5)

### 5.1 Required Submission Artifact
- [ ] **Document Location**: Document exists at `docs/architecture-diagram.md`.
- [ ] **System Overview Diagram**: Clear Mermaid flowchart mapping Ingestion & Capture, Security Guardrails, 7 ADK Agents Pipeline, Firestore Persistence, and Delivery Layer.
- [ ] **7 ADK Agents Sequence & Register**: Complete Mermaid sequence diagram and table detailing all 7 agents (`RootOrchestrator`, `RuleAuditor`, `VisualAuditor`, `TriageAgent`, `RemediationFanOut`, `Remediator`, `Verifier`).
- [ ] **State Lifecycle Contract**: State diagram mapping `detected` → `patched` → `verified` / `dropped`.
- [ ] **Security Defense Layers**: Ingestion guard architecture showing DOM Sanitisation, PII Redaction, Model Armor, Selector DOM validation, and Verifier write gate.
- [ ] **Web & Delivery Component**: Architecture diagram for Proxy Engine, Report Generator, and Email Approval Gate.
- [ ] **GCP Mapping Table**: Service mapping table (Cloud Run, Pub/Sub, Cloud Run Jobs, Model Armor, Vertex AI Gemini 3.7 Flash, Firestore, Cloud Storage).

## 6. Agent Audit Logs & Pipeline Execution Trail

### 6.1 Audit Trail Transparency & Decision Surfacing
- [ ] **7 ADK Agents Log Events**: Displays execution logs for all 7 ADK agents (`RootOrchestrator`, `RuleAuditor`, `VisualAuditor`, `TriageAgent`, `RemediationFanOut`, `Remediator`, `Verifier`).
- [ ] **Discards & Write-Gate Rejections**: Directly surfaces `payload["notes"]` (discards, unmatched DOM selectors) and `payload["write"].findingsRejected` from `pipeline/service.py:155-170`.
- [ ] **Log Filters**: Ability to filter logs by specific agent name (`All (7)`, `RuleAuditor`, `VisualAuditor`, `Verifier`, etc.).
- [ ] **Search Bar**: Real-time text search across log messages and technical details.
- [ ] **Level Badges**: Distinct color badges for `INFO`, `SUCCESS`, `WARN`, `ERROR` log entries.
- [ ] **Copy Audit Trail**: Copy button formats all active log entries with timestamps for debugging or reporting.

---

## 7. Verification Commands

### 3.1 Build & Type Check
```bash
cd web
pnpm run build
```
*Expected Result:* Exit code 0 with zero TypeScript errors and clean Vite bundle output.

### 3.2 Development Server
```bash
cd web
pnpm run dev
```
*Expected Result:* Dashboard accessible at `http://localhost:3000`.

### 3.3 Proxy Route Direct Test
```bash
curl -s http://localhost:3000/proxy/aud_7f3c91 | grep -C 3 "form#contact\|btn-primary"
```
*Expected Result:* Returns HTML containing the sticky preview banner and the replaced button element `<button class="btn-primary" type="submit" aria-label="Send message">`.
