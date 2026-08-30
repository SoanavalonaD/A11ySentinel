import { AuditResultResponse, Finding } from '../types/schema';
import { SAMPLE_FIXTURE, DEMO_SITE_FIXTURE } from '../data/sampleFixture';

export interface AuditRequestPayload {
  url: string;
  trigger?: 'manual' | 'prospect';
  visual?: boolean;
  remediate?: boolean;
  modelTriage?: boolean;
  draftEmail?: boolean;
}

const API_BASE_URL = 'https://a11ysentinel-pipeline-708226575684.us-central1.run.app';

/**
 * Triggers an audit execution against the Cloud Run pipeline endpoint
 */
export async function runAuditApi(payload: AuditRequestPayload): Promise<AuditResultResponse> {
  // If target URL matches known sample fixtures, return immediate rich sample fixture data
  if (payload.url.includes('demo-target.a11ysentinel.dev')) {
    return simulateAuditFlow(SAMPLE_FIXTURE);
  }
  if (payload.url.includes('antsahabe') || payload.url.includes('demo/index.html')) {
    return simulateAuditFlow(DEMO_SITE_FIXTURE);
  }

  try {
    const response = await fetch(`${API_BASE_URL}/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: payload.url,
        trigger: payload.trigger || 'manual',
        remediate: payload.remediate ?? true,
        remediationLimit: 5,
        modelTriage: payload.modelTriage ?? true,
        visual: payload.visual ?? true,
        // Agent 8. A draft is a proposal; the approval gate still decides.
        draftEmail: payload.draftEmail ?? true,
      }),
    });

    if (!response.ok) {
      let errorMsg = `Audit pipeline error (HTTP ${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson.detail) errorMsg = errJson.detail;
        if (errJson.error) errorMsg = errJson.error;
      } catch {}

      console.error(`Audit pipeline returned HTTP ${response.status}: ${errorMsg}`);
      return {
        audit: {
          auditId: `aud_${Math.random().toString(16).substring(2, 8)}`,
          targetUrl: payload.url,
          trigger: payload.trigger || 'manual',
          status: 'failed',
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          pageCount: 0,
          violationsBefore: 0,
          violationsAfter: null,
          proxyUrl: null,
          emailStatus: 'draft',
          error: errorMsg,
        },
        findings: [],
        notes: [`Audit execution failed: ${errorMsg}`],
        auditLogs: [
          {
            logId: `log_err_${Date.now()}`,
            timestamp: new Date().toISOString(),
            agentName: 'RootOrchestrator',
            level: 'error',
            message: `Audit failed for ${payload.url}: ${errorMsg}`,
            stage: 'failed',
          },
        ],
      };
    }

    const data = await response.json();
    return data as AuditResultResponse;
  } catch (error: any) {
    const errorMsg = error?.message || 'Network error or backend unreachable';
    console.error(`Backend connection failed: ${errorMsg}`);
    return {
      audit: {
        auditId: `aud_${Math.random().toString(16).substring(2, 8)}`,
        targetUrl: payload.url,
        trigger: payload.trigger || 'manual',
        status: 'failed',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        pageCount: 0,
        violationsBefore: 0,
        violationsAfter: null,
        proxyUrl: null,
        emailStatus: 'draft',
        error: errorMsg,
      },
      findings: [],
      notes: [`Connection error: ${errorMsg}`],
      auditLogs: [
        {
          logId: `log_err_${Date.now()}`,
          timestamp: new Date().toISOString(),
          agentName: 'RootOrchestrator',
          level: 'error',
          message: `Network/Backend failure when auditing ${payload.url}: ${errorMsg}`,
          stage: 'failed',
        },
      ],
    };
  }
}

async function simulateAuditFlow(fixture: AuditResultResponse): Promise<AuditResultResponse> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(fixture), 600);
  });
}

function generateCustomMockResponse(targetUrl: string): AuditResultResponse {
  const auditId = `aud_${Math.random().toString(16).substring(2, 8)}`;
  const now = new Date().toISOString();
  
  return {
    audit: {
      auditId,
      targetUrl,
      trigger: 'manual',
      status: 'complete',
      createdAt: now,
      completedAt: new Date(Date.now() + 180000).toISOString(),
      pageCount: 3,
      violationsBefore: 18,
      violationsAfter: 2,
      proxyUrl: `/proxy/${auditId}`,
      emailStatus: 'draft',
      error: null,
    },
    findings: [
      {
        findingId: `f_${auditId}_01`,
        pageUrl: targetUrl,
        source: 'axe',
        category: 'button-name',
        wcagCriterion: '4.1.2',
        regionalFramework: 'RGAA 4',
        regionalCriterion: '7.1',
        severity: 'critical',
        userImpact: 'Someone using a screen reader hears only "button" with no indication of its purpose or action.',
        evidence: null,
        selector: 'button.submit-btn',
        xpath: '/html/body/main/form/button[1]',
        currentCode: '<button class="submit-btn"><svg class="icon"></svg></button>',
        patchedCode: '<button class="submit-btn" aria-label="Submit form"><svg class="icon" aria-hidden="true"></svg></button>',
        changeSummary: 'Added aria-label and aria-hidden to decorative SVG.',
        requiresHumanInput: false,
        humanGuidance: null,
        framework: 'html',
        confidence: 0.98,
        status: 'verified',
        verified: true,
        triageRank: 1,
        screenshotRef: null,
        announcedBefore: 'button: (nothing announced)',
        announcedAfter: 'button: "Submit form"'
      },
      {
        findingId: `f_${auditId}_02`,
        pageUrl: targetUrl,
        source: 'visual',
        category: 'MEANINGLESS_LINK_TEXT',
        wcagCriterion: '2.4.4',
        regionalFramework: 'RGAA 4',
        regionalCriterion: '6.1',
        severity: 'serious',
        userImpact: 'Link text "learn more" provides no destination context when read out of order by a screen reader.',
        evidence: 'Gemini 3.7 Flash identified ambiguous "learn more" link in lower hero card.',
        selector: 'a.more-link',
        xpath: '/html/body/main/section/a[1]',
        currentCode: '<a href="/details" class="more-link">learn more</a>',
        patchedCode: '<a href="/details" class="more-link" aria-label="Learn more about our accessibility commitments">learn more</a>',
        changeSummary: 'Added descriptive aria-label.',
        requiresHumanInput: false,
        humanGuidance: null,
        framework: 'html',
        confidence: 0.88,
        status: 'verified',
        verified: true,
        triageRank: 2,
        screenshotRef: null,
        announcedBefore: 'link: "learn more"',
        announcedAfter: 'link: "Learn more about our accessibility commitments"'
      },
      {
        findingId: `f_${auditId}_03`,
        pageUrl: targetUrl,
        source: 'axe',
        category: 'image-alt',
        wcagCriterion: '1.1.1',
        regionalFramework: 'RGAA 4',
        regionalCriterion: '1.3',
        severity: 'critical',
        userImpact: 'Screen reader reads raw image filename instead of descriptive alt text.',
        evidence: null,
        selector: 'img.banner-img',
        xpath: '/html/body/header/img',
        currentCode: '<img src="/assets/hero-banner.png" class="banner-img">',
        patchedCode: '<img src="/assets/hero-banner.png" class="banner-img" alt="TODO: Describe this header image">',
        changeSummary: 'Added alt attribute requiring human guidance.',
        requiresHumanInput: true,
        humanGuidance: 'Replace generic placeholder with an explicit description of the hero image. If the image is purely decorative, use alt="" instead.',
        framework: 'html',
        confidence: 0.95,
        status: 'verified',
        verified: true,
        triageRank: 3,
        screenshotRef: null,
        announcedBefore: 'image: "hero-banner.png"',
        announcedAfter: 'image: "TODO: Describe this header image"'
      },
      {
        findingId: `f_${auditId}_04`,
        pageUrl: targetUrl,
        source: 'axe',
        category: 'color-contrast',
        wcagCriterion: '1.4.3',
        regionalFramework: null,
        regionalCriterion: null,
        severity: 'serious',
        userImpact: 'Low contrast ratio detected between text and background.',
        evidence: null,
        selector: 'footer p.copyright',
        xpath: '/html/body/footer/p',
        currentCode: '<p class="copyright">© 2026 All rights reserved</p>',
        patchedCode: null,
        changeSummary: null,
        requiresHumanInput: false,
        humanGuidance: null,
        framework: 'html',
        confidence: 1.0,
        status: 'detected',
        verified: false,
        triageRank: 4,
        screenshotRef: null,
        announcedBefore: null,
        announcedAfter: null
      }
    ],
    notes: [
      `VisualAuditor: Completed multimodal inspection for ${targetUrl}. Validated DOM selectors.`,
      `Remediator: Generated candidate patches anchored by CSS selectors.`,
      `Verifier: axe-core re-run complete. 0 regressions detected on verified patches.`
    ],
    write: {
      findingsWritten: 3,
      findingsRejected: []
    },
    auditLogs: [
      {
        logId: `log_${auditId}_1`,
        timestamp: now,
        agentName: 'RootOrchestrator',
        level: 'info',
        message: `Session initialised. Starting 7-agent ADK pipeline for ${targetUrl}.`,
        stage: 'queued'
      },
      {
        logId: `log_${auditId}_2`,
        timestamp: new Date(Date.now() + 30000).toISOString(),
        agentName: 'RuleAuditor',
        level: 'success',
        message: 'axe-core 4.10.2 deterministic scan complete. 18 violations detected.',
        details: 'Mapped WCAG 2.1 AA criteria to RGAA 4 equivalents.',
        stage: 'auditing'
      },
      {
        logId: `log_${auditId}_3`,
        timestamp: new Date(Date.now() + 60000).toISOString(),
        agentName: 'VisualAuditor',
        level: 'info',
        message: 'Gemini 3.7 Flash multimodal visual audit complete. Verified DOM selectors.',
        stage: 'auditing'
      },
      {
        logId: `log_${auditId}_4`,
        timestamp: new Date(Date.now() + 90000).toISOString(),
        agentName: 'TriageAgent',
        level: 'info',
        message: 'Triage agent scored findings by severity and user impact.',
        stage: 'auditing'
      },
      {
        logId: `log_${auditId}_5`,
        timestamp: new Date(Date.now() + 120000).toISOString(),
        agentName: 'RemediationFanOut',
        level: 'info',
        message: 'Dispatched parallel remediation tasks with bounded concurrency.',
        stage: 'remediating'
      },
      {
        logId: `log_${auditId}_6`,
        timestamp: new Date(Date.now() + 150000).toISOString(),
        agentName: 'Verifier',
        level: 'success',
        message: 'Verified patches re-tested with axe-core. 0 regressions found.',
        stage: 'verifying'
      },
      {
        logId: `log_${auditId}_7`,
        timestamp: new Date(Date.now() + 180000).toISOString(),
        agentName: 'RootOrchestrator',
        level: 'success',
        message: 'Audit execution complete. Results written to Firestore.',
        stage: 'complete'
      }
    ]
  };
}
