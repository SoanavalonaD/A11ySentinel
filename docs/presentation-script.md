# A11ySentinel — Hackathon Demo Video Script (~4 Minutes)

**Track:** The Taskmaster / The Collaborative Partner / The Fortified Enterprise Fleet  
**Technologies:** Google ADK, Gemini 3.7 Flash, Vertex AI, Model Armor, Cloud Run, Cloud Firestore  
**Live App:** `https://a11ysentinel-pipeline-708226575684.us-central1.run.app/`

---

## 🎬 Minute-by-Minute Video Script & Visual Directions

---

### Segment 1: The Problem & The Solution (0:00 - 0:45)

**[VISUAL: Full-screen view of the A11ySentinel Dashboard on Cloud Run, then cut to a slide or split-screen showing a non-compliant web page.]**

**NARRATOR (Voiceover):**
> "Over 96% of the top 1 million websites fail basic web accessibility guidelines. Web accessibility compliance is expensive, manual, and slow. Traditional scanners point out errors but leave developers to write fixes by hand. On the other end, runtime overlay widgets claim instant compliance, but they break site rendering and fail legal standards.
>
> Meet **A11ySentinel** — an autonomous multi-agent remediation fleet powered by Google ADK, Gemini 3.7 Flash, and Google Cloud. A11ySentinel doesn't just scan for bugs — it autonomously prospects sites, inspects DOM and visual layout, drafts minimal source-level code diffs, and re-verifies every fix with zero regressions under human approval gates."

---

### Segment 2: Google Cloud Infrastructure & Architecture (0:45 - 1:15)

**[VISUAL: Switch browser tab to Google Cloud Console showing Cloud Run `a11ysentinel-pipeline`, Firestore database, and Vertex AI logs.]**

**NARRATOR (Voiceover):**
> "Here is our live production deployment on **Google Cloud**. 
>
> Our backend runs asynchronously on **Cloud Run**, storing audit state and verified findings in **Cloud Firestore**. We orchestrate a fleet of 7 specialized agents using the **Google Agent Development Kit (ADK)**:
> 1. **ProspectScout** for target selection,
> 2. **RuleAuditor** for deterministic axe-core scanning,
> 3. **VisualAuditor** powered by Gemini 3.7 Flash for visual inspection,
> 4. **TriageAgent** for user impact prioritization,
> 5. **Remediator** for drafting source-level HTML diffs,
> 6. **Verifier** for Playwright DOM re-testing, and
> 7. **OutreachDrafter** for human-in-the-loop report emails.
>
> All model prompts pass through inline **Model Armor** guardrails to block prompt injection and prevent PII leaks."

---

### Segment 3: Live Demo — Autonomous Audit & Agent Logs (1:15 - 2:45)

**[VISUAL: Return to the A11ySentinel Dashboard. Click "Prospect Target" or type a URL, then start the audit.]**

**NARRATOR (Voiceover):**
> "Let's see A11ySentinel in action. 
> 
> When we launch an audit, our pipeline executes through 6 structured stages. Notice the **Agent Audit Logs** stream in real-time — each log entry is timestamped, tagged by agent name, and recorded with full observability.
>
> Once complete, A11ySentinel delivers ground-truth results: here, **measured axe-core violations dropped from 47 to 4 — a net reduction rate of 91%**.
>
> Look at the **Verified Source Fixes**. For a button missing an accessible name, A11ySentinel compares screen reader announcements before and after using Chromium CDP: before patch, screen readers hear `button: ""`; after patch, they hear `button: "Calendrier"`. 
>
> Below it, you see the exact, syntax-highlighted **Verified Code Diff** ready for a pull request.
>
> When a fix requires editorial context — like an image description — A11ySentinel flags it with an **'Action Required'** badge and opens an author guidance modal, inviting human collaboration."

---

### Segment 4: Live Proxy Preview & Human Approval Gate (2:45 - 3:30)

**[VISUAL: Click the green "Preview Corrected Site (Live Proxy)" button. Show the proxied page opening in a new tab with the sticky header banner.]**

**NARRATOR (Voiceover):**
> "Now, how do site owners preview these fixes before merging code?
>
> We click **'Preview Corrected Site (Live Proxy)'**. A11ySentinel dynamically renders the target site using Playwright and evaluates verified JavaScript patches in real-time. Notice the sticky banner at the top — and notice that the target site's original CSS stylesheets, fonts, and layout remain **100% perfectly preserved**.
>
> Next, when we click **'Send Remediation Report'**, A11ySentinel opens a strict **Human Approval Gate**. No email ever sends automatically. The human reviewer can inspect the drafted outreach email, verify the neutral tone, confirm the mandatory opt-out link, and approve dispatch with a single click."

---

### Segment 5: Responsible AI Discipline & Closing (3:30 - 4:00)

**[VISUAL: Scroll to the Claim Discipline footer on the report, then show GitHub repository and closing slide.]**

**NARRATOR (Voiceover):**
> "At A11ySentinel, we practice strict claim discipline: A11ySentinel finds, prioritises, drafts, and verifies accessibility fixes under human review. It produces mergeable source-level code diffs — it is not a runtime overlay widget and does not claim automatic legal compliance.
>
> Our entire codebase, spin-up guide, and architecture diagram are open-source on GitHub and live on Google Cloud. 
>
> Thank you!"

---

## 💡 Pro-Tips for Recording Your Video

1. **Resolution & Audio:** Record in 1080p (1920x1080) at 60fps with clear audio.
2. **Tab Pre-loading:** Have Google Cloud Console, Devpost tab, GitHub repo, and the live Cloud Run app opened in clean browser tabs before starting.
3. **Show Google Cloud Proof:** Spend at least 25 seconds showing the GCP Console (`Cloud Run`, `Firestore`, `.run.app` URL) as required by hackathon rules.
4. **Keep it Tight:** Stay under 4 minutes total.
