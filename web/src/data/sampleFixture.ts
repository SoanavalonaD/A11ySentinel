import { AuditResultResponse } from '../types/schema';

export const SAMPLE_FIXTURE: AuditResultResponse = {
  audit: {
    auditId: "aud_7f3c91",
    targetUrl: "https://demo-target.a11ysentinel.dev",
    trigger: "manual",
    status: "complete",
    createdAt: "2026-08-29T14:00:00Z",
    completedAt: "2026-08-29T14:03:12Z",
    pageCount: 4,
    violationsBefore: 47,
    violationsAfter: 6,
    proxyUrl: "/proxy/aud_7f3c91",
    emailStatus: "draft",
    error: null
  },
  findings: [
    {
      findingId: "f_001",
      pageUrl: "https://demo-target.a11ysentinel.dev/contact",
      source: "axe",
      category: "button-name",
      wcagCriterion: "4.1.2",
      regionalFramework: "RGAA 4",
      regionalCriterion: "7.1",
      severity: "critical",
      userImpact: "Someone using a screen reader reaches the end of the contact form and hears only 'button', with no way to tell that it sends the message.",
      evidence: null,
      selector: "form#contact > button.btn-primary",
      xpath: "/html/body/main/form/button[1]",
      currentCode: "<button class=\"btn-primary\" type=\"submit\"><i class=\"icon-send\"></i></button>",
      patchedCode: "<button class=\"btn-primary\" type=\"submit\" aria-label=\"Send message\"><i class=\"icon-send\" aria-hidden=\"true\"></i></button>",
      changeSummary: "Named the submit button and hid its decorative icon.",
      requiresHumanInput: false,
      humanGuidance: null,
      framework: "html",
      confidence: 0.97,
      status: "verified",
      verified: true,
      triageRank: 1,
      screenshotRef: "gs://a11ysentinel-artifacts/aud_7f3c91/contact.png",
      announcedBefore: "button: (nothing — announced only as its type)",
      announcedAfter: "button: \"Send message\""
    },
    {
      findingId: "f_002",
      pageUrl: "https://demo-target.a11ysentinel.dev/about",
      source: "axe",
      category: "image-alt",
      wcagCriterion: "1.1.1",
      regionalFramework: "RGAA 4",
      regionalCriterion: "1.3",
      severity: "critical",
      userImpact: "A screen reader announces the filename 'team-photo-final-v2.jpg' instead of describing the team, so the person learns nothing from the image.",
      evidence: null,
      selector: "section.team > figure > img",
      xpath: "/html/body/main/section[2]/figure/img",
      currentCode: "<img src=\"/img/team-photo-final-v2.jpg\" class=\"team-hero\">",
      patchedCode: "<img src=\"/img/team-photo-final-v2.jpg\" class=\"team-hero\" alt=\"TODO: describe this image\">",
      changeSummary: "Added an alt attribute requiring a human-written description.",
      requiresHumanInput: true,
      humanGuidance: "Replace the placeholder with a description of what the photo actually shows and why it is on this page — for example 'The six-person A11ySentinel team standing outside the Antananarivo office'. If the image is purely decorative and adds nothing the surrounding text does not already say, use alt=\"\" instead.",
      framework: "html",
      confidence: 0.95,
      status: "verified",
      verified: true,
      triageRank: 2,
      screenshotRef: "gs://a11ysentinel-artifacts/aud_7f3c91/about.png",
      announcedBefore: "image: (nothing — announced only as its type)",
      announcedAfter: "image: \"TODO: describe this image\""
    },
    {
      findingId: "f_003",
      pageUrl: "https://demo-target.a11ysentinel.dev/pricing",
      source: "visual",
      category: "COLOUR_ONLY_MEANING",
      wcagCriterion: "1.4.1",
      regionalFramework: "RGAA 4",
      regionalCriterion: "3.1",
      severity: "serious",
      userImpact: "The 'most popular' plan is marked only by a green border. Someone who cannot distinguish the colour sees three identical plans and no recommendation.",
      evidence: "The middle pricing card carries a 2px green border and no label, badge, or text distinguishing it from the two cards beside it.",
      selector: "div.pricing-grid > div.card--featured",
      xpath: "/html/body/main/div/div[2]",
      currentCode: "<div class=\"card card--featured\"><h3>Pro</h3><p class=\"price\">$29/mo</p></div>",
      patchedCode: "<div class=\"card card--featured\"><p class=\"badge\">Most popular</p><h3>Pro</h3><p class=\"price\">$29/mo</p></div>",
      changeSummary: "Added a text badge so the recommendation is not colour-only.",
      requiresHumanInput: false,
      humanGuidance: null,
      framework: "react",
      confidence: 0.82,
      status: "verified",
      verified: true,
      triageRank: 3,
      screenshotRef: "gs://a11ysentinel-artifacts/aud_7f3c91/pricing.png",
      announcedBefore: null,
      announcedAfter: null
    },
    {
      findingId: "f_004",
      pageUrl: "https://demo-target.a11ysentinel.dev/",
      source: "axe",
      category: "color-contrast",
      wcagCriterion: "1.4.3",
      regionalFramework: null,
      regionalCriterion: null,
      severity: "serious",
      userImpact: "The footer text is too faint against its background to be read comfortably by someone with low vision, or on a phone in daylight.",
      evidence: null,
      selector: "footer > p.legal",
      xpath: "/html/body/footer/p[1]",
      currentCode: "<p class=\"legal\">© 2026 Demo Target Ltd.</p>",
      patchedCode: null,
      changeSummary: null,
      requiresHumanInput: false,
      humanGuidance: null,
      framework: "html",
      confidence: 1.0,
      status: "detected",
      verified: false,
      triageRank: 4,
      screenshotRef: "gs://a11ysentinel-artifacts/aud_7f3c91/home.png",
      announcedBefore: null,
      announcedAfter: null
    }
  ],
  notes: [
    "VisualAuditor: Discarded candidate selector `div > span.badge-fix`: Selector did not match any element in live DOM snapshot.",
    "Remediator: Candidate patch for `img.hero-banner` lacked descriptive text. Marked requiresHumanInput = true with placeholder `alt='TODO: Describe hero image'`.",
    "Verifier: Rejected candidate patch `f_009`: Patch introduced secondary color contrast regression on sibling element. Status set to dropped."
  ],
  write: {
    findingsWritten: 4,
    findingsRejected: [
      { findingId: "f_009", reason: "Verifier axe-core re-run detected contrast regression on sibling element." }
    ]
  },
  auditLogs: [
    {
      logId: "log_001",
      timestamp: "2026-08-29T14:00:01Z",
      agentName: "RootOrchestrator",
      level: "info",
      message: "Session initialised. Starting 7-agent ADK pipeline for target https://demo-target.a11ysentinel.dev.",
      stage: "queued"
    },
    {
      logId: "log_002",
      timestamp: "2026-08-29T14:00:15Z",
      agentName: "RuleAuditor",
      level: "success",
      message: "axe-core 4.10.2 deterministic scan complete. 47 total violations found across 4 scanned pages.",
      details: "Mapped WCAG 2.1 AA criteria to RGAA 4 equivalents.",
      stage: "auditing"
    },
    {
      logId: "log_003",
      timestamp: "2026-08-29T14:00:45Z",
      agentName: "VisualAuditor",
      level: "warn",
      message: "Gemini 3.7 Flash multimodal inspection finished. Discarded 1 candidate visual finding due to unmatched DOM selector.",
      details: "Discarded selector: `div > span.badge-fix` (DOM match count: 0).",
      stage: "auditing"
    },
    {
      logId: "log_004",
      timestamp: "2026-08-29T14:01:10Z",
      agentName: "TriageAgent",
      level: "info",
      message: "Triage agent scored 47 findings. Prioritised unlabelled form submit buttons as Rank 1 critical items.",
      stage: "auditing"
    },
    {
      logId: "log_005",
      timestamp: "2026-08-29T14:01:40Z",
      agentName: "RemediationFanOut",
      level: "info",
      message: "Dispatched parallel remediation for 5 findings with bounded concurrency limit = 5.",
      stage: "remediating"
    },
    {
      logId: "log_006",
      timestamp: "2026-08-29T14:02:15Z",
      agentName: "Remediator",
      level: "info",
      message: "Generated candidate patch for `img.hero-banner`. Set requiresHumanInput = true with author guidance.",
      details: "Inserted placeholder: `alt=\"TODO: Describe team in office\"`.",
      stage: "remediating"
    },
    {
      logId: "log_007",
      timestamp: "2026-08-29T14:02:50Z",
      agentName: "Verifier",
      level: "success",
      message: "Verified patch for finding f_001 (`form#contact > button.btn-primary`). axe-core re-run: 0 regressions.",
      details: "Screen reader announcement updated: 'button' -> 'Send message, submit button'.",
      stage: "verifying"
    },
    {
      logId: "log_008",
      timestamp: "2026-08-29T14:03:05Z",
      agentName: "Verifier",
      level: "error",
      message: "Write Gate Rejection: Candidate patch f_009 failed verification due to secondary contrast regression.",
      details: "Finding f_009 status set to dropped. Reason: axe-core re-run failed.",
      stage: "verifying"
    },
    {
      logId: "log_009",
      timestamp: "2026-08-29T14:03:12Z",
      agentName: "RootOrchestrator",
      level: "success",
      message: "Pipeline completed successfully. 4 verified patches written to Firestore. Status updated to complete.",
      stage: "complete"
    }
  ],
  // Agent 8 accepted. Prose only — every number, link and the opt-out footer
  // below it is template text.
  emailDraft: {
    drafted: true,
    modelUsed: true,
    opening:
      "We ran an automated accessibility audit on demo-target.a11ysentinel.dev without being asked, and wanted to share the few things it found that affect people directly.",
    highlights: [
      {
        findingId: "f_001",
        sentence:
          "Someone using a screen reader reaches the end of your contact form and hears only 'button', with no way to tell that it sends the message."
      },
      {
        findingId: "f_002",
        sentence:
          "The pricing comparison image is announced only as 'image', so the figures it carries are lost to anyone not looking at the screen."
      }
    ],
    closing: "The full report is below if it is useful to you.",
    language: "en",
    reason: null,
    screened:
      "Model Armor screened 6 text blocks: no prompt injection or malicious content detected"
  }
};

export const DEMO_SITE_FIXTURE: AuditResultResponse = {
  audit: {
    auditId: "aud_antsahabe_99",
    targetUrl: "https://a11ysentinel-pipeline-708226575684.us-central1.run.app/demo/index.html",
    trigger: "prospect",
    status: "complete",
    createdAt: "2026-08-30T10:15:00Z",
    completedAt: "2026-08-30T10:18:22Z",
    pageCount: 5,
    violationsBefore: 21,
    violationsAfter: 4,
    proxyUrl: "/proxy/aud_antsahabe_99",
    emailStatus: "draft",
    error: null
  },
  findings: [
    {
      findingId: "f_ants_01",
      pageUrl: "https://a11ysentinel-pipeline-708226575684.us-central1.run.app/demo/index.html",
      source: "axe",
      category: "html-has-lang",
      wcagCriterion: "3.1.1",
      regionalFramework: "RGAA 4",
      regionalCriterion: "8.1",
      severity: "critical",
      userImpact: "No language specified on <html> element. Screen readers default to system language pronunciation.",
      evidence: null,
      selector: "html",
      xpath: "/html",
      currentCode: "<html>",
      patchedCode: "<html lang=\"en\">",
      changeSummary: "Added lang=\"en\" attribute to root element.",
      requiresHumanInput: false,
      humanGuidance: null,
      framework: "html",
      confidence: 1.0,
      status: "verified",
      verified: true,
      triageRank: 1,
      screenshotRef: null,
      announcedBefore: null,
      announcedAfter: null
    },
    {
      findingId: "f_ants_02",
      pageUrl: "https://a11ysentinel-pipeline-708226575684.us-central1.run.app/demo/index.html",
      source: "visual",
      category: "MEANINGLESS_LINK_TEXT",
      wcagCriterion: "2.4.4",
      regionalFramework: "RGAA 4",
      regionalCriterion: "6.1",
      severity: "serious",
      userImpact: "Link text says 'click here'. Users navigating by link list hear no context about where the link leads.",
      evidence: "A call-to-action button uses vague phrase 'click here' instead of descriptive destination text.",
      selector: "a.btn-link-action",
      xpath: "/html/body/main/div[1]/a[1]",
      currentCode: "<a href=\"/products.html\" class=\"btn-link-action\">click here</a>",
      patchedCode: "<a href=\"/products.html\" class=\"btn-link-action\" aria-label=\"Discover fresh local produce at Marché Antsahabe\">click here</a>",
      changeSummary: "Added descriptive aria-label to clarify link destination.",
      requiresHumanInput: false,
      humanGuidance: null,
      framework: "html",
      confidence: 0.89,
      status: "verified",
      verified: true,
      triageRank: 2,
      screenshotRef: null,
      announcedBefore: "link: \"click here\"",
      announcedAfter: "link: \"Discover fresh local produce at Marché Antsahabe\""
    },
    {
      findingId: "f_ants_03",
      pageUrl: "https://a11ysentinel-pipeline-708226575684.us-central1.run.app/demo/index.html",
      source: "visual",
      category: "PLACEHOLDER_AS_LABEL",
      wcagCriterion: "3.3.2",
      regionalFramework: "RGAA 4",
      regionalCriterion: "11.1",
      severity: "serious",
      userImpact: "The search input field relies solely on a placeholder. Once text is typed, the label vanishes, confusing users.",
      evidence: "Search input field in top navbar has placeholder='Search...' but no associated <label> element.",
      selector: "input#site-search-input",
      xpath: "/html/body/header/form/input[1]",
      currentCode: "<input type=\"text\" id=\"site-search-input\" placeholder=\"Search products...\">",
      patchedCode: "<label for=\"site-search-input\" class=\"sr-only font-bold\">Search products</label><input type=\"text\" id=\"site-search-input\" placeholder=\"Search products...\">",
      changeSummary: "Inserted visually hidden <label> linked to search input ID.",
      requiresHumanInput: false,
      humanGuidance: null,
      framework: "html",
      confidence: 0.92,
      status: "verified",
      verified: true,
      triageRank: 3,
      screenshotRef: null,
      announcedBefore: "edit text: \"Search products...\"",
      announcedAfter: "edit text: \"Search products\""
    }
  ],
  // Agent 8 refused. This is the fallback path: the email still goes out, on
  // the static template, and the modal says why.
  emailDraft: {
    drafted: false,
    modelUsed: false,
    opening: null,
    highlights: [],
    closing: null,
    language: "fr",
    reason:
      "draft refused, claim discipline: asserts compliance [fr] ('conforme'); raises litigation [fr] ('poursuites')",
    screened:
      "Model Armor screened 9 text blocks: no prompt injection or malicious content detected"
  }
};
