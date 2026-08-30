# A11ySentinel — Architecture Diagram & System Design

> **Hackathon Track:** Taskmaster  
> **Google Agent Framework:** Google ADK (Python)  
> **Primary Model:** Gemini 3.7 Flash (Vertex AI `global` endpoint)  
> **Rule Engine:** axe-core 4.10.2 (Deterministic ground truth)  
> **Infrastructure:** Cloud Run, Cloud Run Jobs, Pub/Sub, Firestore, Cloud Storage, Model Armor  

---

## 1. System Architecture Overview

A11ySentinel is built as an autonomous background agent pipeline. It receives untrusted third-party web pages, audits them for WCAG 2.1 AA / RGAA 4 accessibility violations, generates source-level code diffs, verifies each fix using a deterministic rule engine, and serves a live corrected proxy preview under human approval.

```mermaid
flowchart TD
    subgraph INGESTION ["1. Ingestion & Capture"]
        UI["Web Dashboard / Prospector"] -->|POST /audit| INTAKE["Intake Service (Cloud Run)"]
        INTAKE -->|Publish message| PUBSUB["Pub/Sub Topic: audit-jobs"]
        PUBSUB -->|Trigger job| CAPTURE["Capture Worker (Cloud Run Job + Playwright)"]
        CAPTURE -->|Save DOM & Screenshot| GCS[("Cloud Storage gs://artifacts")]
    end

    subgraph SECURITY ["2. Security & Guardrails"]
        CAPTURE -->|Raw Page Text| ARMOR["Model Armor (Prompt Injection Filter)"]
        CAPTURE -->|Page Content| PII["Deterministic PII Redaction Engine"]
    end

    subgraph ADK_PIPELINE ["3. ADK Agent Pipeline (7 Agents)"]
        ARMOR --> AG1
        PII --> AG1

        AG1["1. RootOrchestrator (SequentialAgent)"] --> AG2["2. RuleAuditor (axe-core Engine)"]
        AG2 --> AG3["3. VisualAuditor (Gemini 3.7 Flash)"]
        AG3 --> AG4["4. TriageAgent (Impact Scoring)"]
        AG4 --> AG5["5. RemediationFanOut (ParallelAgent)"]
        AG5 --> AG6["6. Remediator (Diff Generation)"]
        AG6 --> AG7["7. Verifier (axe-core Re-run)"]
    end

    subgraph STORE ["4. Data Contract & Persistence"]
        AG7 -->|Write verified findings| FIRESTORE[("Cloud Firestore audits/{auditId}")]
    end

    subgraph DELIVERY ["5. Web Layer & Delivery (Workstream B)"]
        FIRESTORE --> DASHBOARD["Web Dashboard (React + Vite + Tailwind)"]
        FIRESTORE --> PROXY["Proxy Service (DOM Patching by Selector)"]
        DASHBOARD --> REPORT["Remediation Report Generator (PDF / MD)"]
        DASHBOARD --> EMAIL["Email Approval Gate (Gmail API + Opt-Out)"]
    end

    classDef primary fill:#4f46e5,color:#fff,stroke:#312e81,stroke-width:2px;
    classDef success fill:#10b981,color:#fff,stroke:#064e3b,stroke-width:2px;
    classDef warning fill:#f59e0b,color:#fff,stroke:#78350f,stroke-width:2px;
    classDef danger fill:#ef4444,color:#fff,stroke:#7f1d1d,stroke-width:2px;
    classDef storage fill:#0f172a,color:#38bdf8,stroke:#0284c7,stroke-width:2px;

    class INTAKE,CAPTURE,AG1,AG5 primary;
    class AG2,AG7,PROXY success;
    class AG3,AG4,AG6 warning;
    class ARMOR,PII,EMAIL danger;
    class GCS,FIRESTORE storage;
```

---

## 2. The 7 ADK Agents Breakdown

The central pipeline consists of **seven ADK agents** orchestrated by a `SequentialAgent`:

```mermaid
sequenceDiagram
    autonumber
    participant Orch as 1. RootOrchestrator
    participant Rule as 2. RuleAuditor
    participant Vis as 3. VisualAuditor
    participant Tri as 4. TriageAgent
    participant Fan as 5. RemediationFanOut
    participant Rem as 6. Remediator
    participant Ver as 7. Verifier
    participant Store as Firestore Store

    Orch->>Rule: 1. Pass DOM Snapshot
    Rule-->>Orch: Return axe-core violations (Ground Truth)
    Orch->>Vis: 2. Pass Screenshot + Trimmed DOM + axe findings
    Vis-->>Orch: Return visual-only findings (Validated DOM Selectors)
    Orch->>Tri: 3. Pass all findings
    Tri-->>Orch: Return scored & plain-language impact findings
    Orch->>Fan: 4. Dispatch parallel remediation
    loop Per Finding
        Fan->>Rem: Pass single finding + DOM snippet
        Rem-->>Fan: Return candidate patch JSON (or requiresHumanInput)
    end
    Fan-->>Orch: Return candidate patches
    Orch->>Ver: 5. Pass patched DOM
    Ver->>Ver: Re-run axe-core on patched DOM
    alt Violation Gone & 0 Regressions
        Ver-->>Orch: Set status = "verified", verified = true
        Orch->>Store: Write verified finding to Firestore
    else Failed Verification / Regression
        Ver-->>Orch: Set status = "patched", verified = false
        Orch->>Orch: Drop patch from public report/proxy
    end
```

### Agent Register Summary

| # | Agent Name | ADK Primitive Type | Gemini Model ? | Deterministic vs Generative | Core Responsibility |
|---|---|---|---|---|---|
| **1** | **`RootOrchestrator`** | `SequentialAgent` | No | Deterministic | Orchestrates agent sequence (2 → 3 → 4 → 5 → 7), manages session state and writes audit status transitions. |
| **2** | **`RuleAuditor`** | Custom `BaseAgent` | No | Deterministic | Injects `axe-core 4.10.2` via Playwright Chromium. Establishes the **ground truth**. Maps WCAG 2.1 AA to RGAA 4. |
| **3** | **`VisualAuditor`** | Custom `BaseAgent` | **Gemini 3.7 Flash** | Generative + Code Validation | Analyzes screenshot + trimmed DOM. Catches visual flaws static rules miss. Validates every returned selector against DOM before keeping. |
| **4** | **`TriageAgent`** | `LlmAgent` | **Gemini 3.7 Flash** | Generative | Scores severity × user impact × effort. Rewrites impact into plain-language consequence. |
| **5** | **`RemediationFanOut`** | `ParallelAgent` | No | Deterministic | Dispatches one `Remediator` instance per finding with bounded concurrency. |
| **6** | **`Remediator`** | `LlmAgent` | **Gemini 3.7 Flash** | Generative | Generates targeted source diffs (`patchedCode`) anchored by CSS selector. Sets `requiresHumanInput: true` when content cannot be inferred. |
| **7** | **`Verifier`** | Custom `BaseAgent` | No | Deterministic | Re-applies patch to DOM snapshot, re-runs `axe-core`. Confirms violation is gone & 0 regressions. Sets `status: "verified"`. |

---

## 3. Data Flow & State Lifecycle (`status`)

Every audit finding follows an explicit state transition contract defined in `contracts/schema.md` (Draft 4):

```mermaid
stateDiagram-v2
    [*] --> detected: RuleAuditor or VisualAuditor finds violation
    detected --> patched: Remediator generates candidate code patch
    patched --> verified: Verifier re-runs axe-core (0 regressions & original gone)
    patched --> dropped: Verifier detects regression or failed fix
    
    state detected {
        [*] --> DisplayAsFinding: Show in UI as violation (NO diff attached)
    }
    
    state patched {
        [*] --> InternalOnly: Transient internal pipeline draft (NEVER rendered to UI)
    }
    
    state verified {
        [*] --> DisplayAsVerified: Show in UI & serve via Proxy (Diff attached)
    }

    dropped --> [*]: Discarded at write gate
```

---

## 4. Security & Ingestion Defense Layers

Because A11ySentinel ingests arbitrary third-party web content (untrusted input), it implements a multi-layered defense architecture:

```mermaid
flowchart LR
    UNTRUSTED["Untrusted Web Page"] --> L1["Layer 1: DOM Sanitisation"]
    L1 -->|Strip scripts, styles, comments| L2["Layer 2: Deterministic PII Redaction"]
    L2 -->|Redact emails, phone, IBAN, cards| L3["Layer 3: Model Armor Classifier"]
    L3 -->|Screen for indirect prompt injections| L4["Layer 4: Gemini LLM Evaluation"]
    L4 --> L5["Layer 5: Selector DOM Validation"]
    L5 --> L6["Layer 6: Verifier axe-core Re-run"]

    classDef guard fill:#991b1b,color:#fff,stroke:#f87171,stroke-width:2px;
    class L1,L2,L3,L5,L6 guard;
```

1. **DOM Sanitisation:** Strips `<script>`, `<style>`, inline event handlers, and comments before sending to LLM.
2. **Deterministic PII Redaction:** Local regex/token engine redacts personal data (emails, phone numbers, IBANs, credit card numbers) before LLM ingestion. Fails closed.
3. **Google Cloud Model Armor:** Evaluates text blocks for prompt injection / jailbreak attempts.
4. **Selector DOM Validation:** Every selector returned by Gemini is queried against the live DOM in code. Unmatched selectors are discarded immediately.
5. **Verifier Write Gate:** Only patches that pass an automated `axe-core` re-run are written to Firestore as `status: "verified"`.

---

## 5. Web & Delivery Architecture (Workstream B)

The web layer consumes data written to Firestore and Cloud Storage:

```mermaid
flowchart TD
    subgraph CLIENT_SIDE ["Client Browser"]
        DASH["React 18 Dashboard UI"]
        REPORT_VIEW["Remediation Report View"]
        MODAL["Email Approval Modal"]
    end

    subgraph PROXY_SERVICE ["Proxy Engine (Deliverable B2)"]
        HTTP_GET["GET /proxy/:auditId"] --> FETCH_TARGET["Fetch targetUrl HTML"]
        FETCH_TARGET --> FETCH_VERIFIED["Fetch status = verified findings"]
        FETCH_VERIFIED --> PARSE_DOM["Parse DOM with node-html-parser"]
        PARSE_DOM --> REPLACE_NODES["Replace element by selector with patchedCode"]
        REPLACE_NODES --> INJECT_BANNER["Inject #a11ysentinel-proxy-banner"]
        INJECT_BANNER --> SERVE_HTML["Serve modified HTML preview"]
    end

    DASH -->|View Diffs & Metrics| REPORT_VIEW
    DASH -->|Click Preview| PROXY_SERVICE
    DASH -->|Click Email Report| MODAL
    MODAL -->|Explicit Human Approval| GMAIL_DISPATCH["Gmail API / Email Dispatcher"]

    classDef delivery fill:#1e1b4b,color:#fff,stroke:#6366f1,stroke-width:2px;
    class DASH,REPORT_VIEW,MODAL,PROXY_SERVICE delivery;
```

* **Web Dashboard:** React 18 + Vite + TailwindCSS app displaying measured before/after violation counts (`violationsBefore` → `violationsAfter`), priority action items, screen reader announcement comparisons (`announcedBefore` → `announcedAfter`), code diffs, and editorial guidance modals.
* **Proxy Service:** Server component fetching target HTML, filtering `status === "verified"` findings, replacing elements matched by CSS `selector` with `patchedCode`, and injecting a sticky preview header banner.
* **Remediation Report Generator:** Structured remediation document generator with print/PDF layout (`window.print()`) and Markdown file exporter.
* **Email + Approval Gate:** Human-in-the-loop email dispatch system enforcing neutral non-litigious copy and mandatory opt-out footer lines.

---

## 6. Infrastructure Component Mapping (Google Cloud)

| Component | GCP Infrastructure Service | Configuration & Scale |
|---|---|---|
| **Intake Service** | Cloud Run | `a11ysentinel-pipeline` (`us-central1`) |
| **Asynchronous Job Queue** | Cloud Pub/Sub | Topic `audit-jobs`, push subscription |
| **Heavy Capture Worker** | Cloud Run Jobs | Playwright Chromium, 2 vCPU, 4GB RAM |
| **Guardrails & Security** | Google Cloud Model Armor | Template `a11ysentinel-screen` (`us-central1`) |
| **LLM Inference** | Vertex AI | Gemini 3.7 Flash (`global` endpoint) |
| **Audit Persistence** | Cloud Firestore | Collections `audits/{auditId}` and `findings/{findingId}` |
| **Artifact Storage** | Cloud Storage (`gs://`) | Bucket `gs://a11ysentinel-artifacts` |
| **Proxy & Web UI** | Cloud Run / Node.js | Hosted Web Layer & Proxy Service |
