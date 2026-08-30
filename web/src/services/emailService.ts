import { Audit, EmailDraft, EmailStatus, Finding } from '../types/schema';

/**
 * Escape anything that reaches the HTML body.
 *
 * The narrative comes from a model, grounded in text taken off a third-party
 * page. It is data, not markup, and it must not be able to close a tag.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Where an approved message is POSTed. Empty until a send route exists, and
 * an empty value is the honest default: nothing is dispatched and the UI says
 * so, rather than reporting a delivery that never happened.
 */
export const MAIL_TRANSPORT_URL: string = '';

export interface EmailPayload {
  auditId: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  /** Whether Agent 8's narrative was used, or the static template. */
  narrativeSource: 'agent' | 'template';
}

/**
 * Builds neutral, non-litigious email content: audit summary metrics, proxy
 * link, report link, and the mandatory opt-out footer.
 *
 * Agent 8 (`OutreachDrafter`) may supply the *prose* — an opening, up to three
 * consequence sentences, and a closing. Everything that carries a claim stays
 * here in the template and is never model output: the metrics, every link, the
 * claim-discipline notice, the opt-out footer and the subject line.
 *
 * A draft with `drafted: false` is the normal instruction to use the static
 * copy. It is not an error, and there is no fallback to write — the static
 * copy is what this function produced before Agent 8 existed.
 */
export function buildAuditEmailContent(
  audit: Audit,
  findings: Finding[],
  recipientOverride?: string,
  draft?: EmailDraft | null,
): EmailPayload {
  const domain = getDomainFromUrl(audit.targetUrl);
  const recipientEmail = recipientOverride || `contact@${domain}`;
  const subject = `A11ySentinel Accessibility Audit Results for ${domain} (Ref: ${audit.auditId})`;

  // Only a draft that passed the pipeline's claim-discipline screen is used,
  // and only if it actually carries prose.
  const useAgent = Boolean(draft?.drafted && draft.opening && draft.highlights.length > 0);
  const narrativeSource: 'agent' | 'template' = useAgent ? 'agent' : 'template';

  const opening = useAgent
    ? (draft!.opening as string)
    : `A11ySentinel has completed an automated accessibility audit for ${audit.targetUrl}.`;
  const highlights = useAgent ? draft!.highlights.map((h) => h.sentence) : [];
  const closing = useAgent && draft!.closing ? draft!.closing : '';

  const highlightsText = highlights.length
    ? '\n\nWhat this means for people using the site:\n' +
      highlights.map((h) => `- ${h}`).join('\n')
    : '';
  const highlightsHtml = highlights.length
    ? `<ul style="margin: 16px 0; padding-left: 20px;">${highlights
        .map((h) => `<li style="margin-bottom: 8px;">${escapeHtml(h)}</li>`)
        .join('')}</ul>`
    : '';

  const before = audit.violationsBefore;
  const after = audit.violationsAfter !== null ? audit.violationsAfter : before;
  const verifiedFixesCount = findings.filter((f) => f.status === 'verified').length;
  const humanActionCount = findings.filter((f) => f.requiresHumanInput).length;

  const bodyText = `
Hello,

${opening}${highlightsText}

Audit Summary:
- Target URL: ${audit.targetUrl}
- Audit ID: ${audit.auditId}
- Measured axe-core Violations (Before): ${before}
- Measured axe-core Violations (After): ${after}
- Verified Source-Level Patches: ${verifiedFixesCount}
- Items Requiring Human Review: ${humanActionCount}

Live Corrected Proxy Preview:
${audit.proxyUrl || 'Available on A11ySentinel Dashboard'}
${closing ? `
${closing}
` : ''}
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
        <p>${escapeHtml(opening)}</p>
        <p style="font-size: 13px; color: #64748b;">Audited: <strong>${escapeHtml(audit.targetUrl)}</strong> (Audit ID: <code>${escapeHtml(audit.auditId)}</code>).</p>
        ${highlightsHtml}

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

        ${closing ? `<p>${escapeHtml(closing)}</p>` : ''}

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
    narrativeSource,
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

export interface DispatchResult {
  /** True only when a transport confirmed the message left the system. */
  delivered: boolean;
  /** `approved` when a human signed off but nothing could dispatch. */
  status: EmailStatus;
  /** Shown to the operator. Never shown to a recipient. */
  detail: string;
}

/**
 * Records the human approval, and dispatches only if a transport exists.
 *
 * **No transport exists yet.** The pipeline serves /audit, /pubsub and
 * /prospect — there is no send route and no Gmail integration anywhere in
 * this project. This function used to resolve `{success: true, status:
 * 'sent'}` after a 1200ms timer, which meant the dashboard reported a
 * delivered email every time while nothing had been sent.
 *
 * That is the same class of defect as the silent mock fallback: a UI
 * asserting something the code did not do. It matters more here, because
 * "sent" is a claim about a message reaching a real person, and an operator
 * who believes it will not send the real one.
 *
 * So the approval is recorded honestly. `emailStatus` moves to `approved` —
 * the state the contract already defines for exactly this, a human signed off
 * and dispatch has not happened — and reaches `sent` only when something
 * confirms delivery. Wire a transport here and the rest of the UI needs no
 * change.
 */
export async function sendApprovedEmail(payload: EmailPayload): Promise<DispatchResult> {
  const transport = MAIL_TRANSPORT_URL;

  if (!transport) {
    return {
      delivered: false,
      status: 'approved',
      detail:
        'Approval recorded. No mail transport is configured, so nothing was ' +
        'dispatched — the drafted message is ready to send once one is wired up.',
    };
  }

  try {
    const response = await fetch(transport, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        delivered: false,
        status: 'approved',
        detail: `Transport refused the message (HTTP ${response.status}). Nothing was sent.`,
      };
    }

    return {
      delivered: true,
      status: 'sent',
      detail: `Delivered to ${payload.recipientEmail}.`,
    };
  } catch (err) {
    // A failed send is reported, never swallowed into a success.
    return {
      delivered: false,
      status: 'approved',
      detail: `Transport unreachable: ${err instanceof Error ? err.message : String(err)}. Nothing was sent.`,
    };
  }
}
