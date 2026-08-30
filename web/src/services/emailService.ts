import { Audit, Finding, EmailStatus } from '../types/schema';

export interface EmailPayload {
  auditId: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

/**
 * Builds neutral, non-litigious email content containing audit summary metrics,
 * proxy link, report link, and mandatory opt-out footer.
 */
export function buildAuditEmailContent(audit: Audit, findings: Finding[], recipientOverride?: string): EmailPayload {
  const domain = getDomainFromUrl(audit.targetUrl);
  const recipientEmail = recipientOverride || `contact@${domain}`;
  const subject = `A11ySentinel Accessibility Audit Results for ${domain} (Ref: ${audit.auditId})`;

  const before = audit.violationsBefore;
  const after = audit.violationsAfter !== null ? audit.violationsAfter : before;
  const verifiedFixesCount = findings.filter((f) => f.status === 'verified').length;
  const humanActionCount = findings.filter((f) => f.requiresHumanInput).length;

  const bodyText = `
Hello,

A11ySentinel has completed an automated accessibility audit for ${audit.targetUrl}.

Audit Summary:
- Target URL: ${audit.targetUrl}
- Audit ID: ${audit.auditId}
- Measured axe-core Violations (Before): ${before}
- Measured axe-core Violations (After): ${after}
- Verified Source-Level Patches: ${verifiedFixesCount}
- Items Requiring Human Review: ${humanActionCount}

Live Corrected Proxy Preview:
${audit.proxyUrl || 'Available on A11ySentinel Dashboard'}

About A11ySentinel:
A11ySentinel finds, prioritises, drafts, and verifies accessibility fixes under human review. It generates source-level code diffs to merge into your codebase. It is not a client-side runtime overlay script and does not claim automatic 100% legal compliance.

----------------------------------------------------------------------
Opt-out notice: If you prefer not to receive accessibility audit reports for ${domain}, please click here to opt out: https://a11ysentinel-pipeline-708226575684.us-central1.run.app/opt-out?domain=${encodeURIComponent(domain)}
----------------------------------------------------------------------
`.trim();

  const bodyHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
      <div style="background: #0f172a; padding: 24px; border-radius: 12px 12px 0 0; color: white;">
        <span style="background: #6366f1; color: white; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; text-transform: uppercase;">A11ySentinel Audit Report</span>
        <h2 style="margin: 12px 0 0 0; font-size: 20px;">Accessibility Audit Results for ${domain}</h2>
      </div>

      <div style="padding: 24px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none;">
        <p style="margin-top: 0;">Hello,</p>
        <p>A11ySentinel has completed an accessibility audit for <strong>${audit.targetUrl}</strong> (Audit ID: <code>${audit.auditId}</code>).</p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <h3 style="margin-top: 0; font-size: 14px; color: #334155; text-transform: uppercase;">Audit Summary Metrics</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Measured axe-core Violations:</td>
              <td style="padding: 6px 0; font-weight: 700;"><span style="color: #ef4444; text-decoration: line-through;">${before}</span> &rarr; <span style="color: #10b981;">${after}</span></td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Verified Source Patches:</td>
              <td style="padding: 6px 0; font-weight: 700; color: #10b981;">${verifiedFixesCount} verified</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Human Action Required:</td>
              <td style="padding: 6px 0; font-weight: 700; color: #f59e0b;">${humanActionCount} item(s)</td>
            </tr>
          </table>
        </div>

        ${audit.proxyUrl ? `
        <div style="text-align: center; margin: 24px 0;">
          <a href="${audit.proxyUrl}" style="background: #10b981; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">Preview Corrected Site (Live Proxy) &rarr;</a>
        </div>
        ` : ''}

        <div style="border-left: 3px solid #6366f1; padding-left: 12px; margin: 20px 0; font-size: 12px; color: #64748b;">
          <strong>Claim Discipline Notice:</strong> A11ySentinel finds, prioritises, drafts, and verifies fixes under human review. It generates mergeable source diffs. It is not a runtime overlay script and does not claim automatic 100% legal compliance.
        </div>
      </div>

      <!-- MANDATORY OPT-OUT FOOTER -->
      <div style="padding: 16px 24px; background: #f1f5f9; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; font-size: 11px; color: #64748b; text-align: center;">
        <p style="margin: 0;">
          <strong>Opt-Out Notice:</strong> If you prefer not to receive accessibility audit reports for ${domain}, 
          <a href="https://a11ysentinel-pipeline-708226575684.us-central1.run.app/opt-out?domain=${encodeURIComponent(domain)}" style="color: #4f46e5; text-decoration: underline;">click here to opt out</a>.
        </p>
      </div>
    </div>
  `;

  return {
    auditId: audit.auditId,
    recipientEmail,
    subject,
    bodyHtml,
    bodyText,
  };
}

/**
 * Helper to extract domain from URL
 */
function getDomainFromUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.replace('www.', '');
  } catch {
    return 'demo-target.dev';
  }
}

/**
 * Triggers human-approved email dispatch (Gmail API or simulated send)
 */
export async function sendApprovedEmail(payload: EmailPayload): Promise<{ success: boolean; status: EmailStatus }> {
  // Simulate dispatch behind human approval gate
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        status: 'sent',
      });
    }, 1200);
  });
}
