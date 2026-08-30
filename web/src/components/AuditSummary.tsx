import React, { useEffect, useState } from 'react';
import { Audit } from '../types/schema';
import {
  ShieldCheck,
  ExternalLink,
  FileText,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Mail,
  CheckCheck,
} from 'lucide-react';

interface AuditSummaryProps {
  audit: Audit;
  verifiedCount: number;
  humanInputCount: number;
  onOpenReport: () => void;
  onOpenEmailModal: () => void;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Count a metric up from 0 over 950ms, ease-out cubic.
 *
 * Lands on the final value immediately when reduced motion is requested —
 * the number is the point, the animation is decoration.
 */
function useCountUp(target: number, duration = 950): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

const Metric: React.FC<{
  label: string;
  note: string;
  icon?: React.ReactNode;
  tinted?: boolean;
  children: React.ReactNode;
}> = ({ label, note, icon, tinted, children }) => (
  // The grid gap shows `--line` through, so every cell needs its own opaque
  // ground — without it the text is measured against the divider colour.
  <div
    className={`p-5 bg-panel ${tinted ? 'border-t-2 border-t-yellow' : ''}`}
    style={tinted ? { background: 'color-mix(in srgb, var(--yellow) 8%, var(--bg))' } : undefined}
  >
    <div className="flex items-center justify-between gap-2 mb-2">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.6px] text-bodyp">{label}</span>
      {icon}
    </div>
    {children}
    <div className="mt-2 text-[11px] text-bodyp">{note}</div>
  </div>
);

export const AuditSummary: React.FC<AuditSummaryProps> = ({
  audit,
  verifiedCount,
  humanInputCount,
  onOpenReport,
  onOpenEmailModal,
}) => {
  const before = audit.violationsBefore;
  const after = audit.violationsAfter !== null ? audit.violationsAfter : before;
  const fixedCount = Math.max(0, before - after);
  const reductionPercentage = before > 0 ? Math.round((fixedCount / before) * 100) : 0;
  const emailStatus = audit.emailStatus || 'draft';
  const failed = audit.status === 'failed';

  const beforeN = useCountUp(before);
  const afterN = useCountUp(after);
  const verifiedN = useCountUp(verifiedCount);
  const humanN = useCountUp(humanInputCount);
  const pagesN = useCountUp(audit.pageCount);

  // On the dark plate, accent colours never carry text — the ink stays
  // --on-plate and the accent lives in the border and the fill.
  const plateAction =
    'inline-flex items-center gap-2 px-4 py-2.5 text-[12.5px] font-semibold text-on-plate border transition-colors';

  return (
    <section className="panel card-shadow" aria-label="Audit summary">
      {/* Hero plate */}
      <div className="plate plate-grid plate-sweep px-6 py-7">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[11px] text-on-plate/80 mb-3">
            <span>Audit ID: {audit.auditId}</span>
            <span aria-hidden="true">·</span>
            <span>{new Date(audit.createdAt).toLocaleString('en-US')}</span>
            <span aria-hidden="true">·</span>
            <span
              className={`px-2 py-0.5 font-bold uppercase tracking-[0.5px] text-on-plate border ${
                failed ? 'border-red' : emailStatus === 'sent' ? 'border-green' : 'border-yellow'
              }`}
              style={{
                background: failed
                  ? 'color-mix(in srgb, var(--red) 22%, transparent)'
                  : emailStatus === 'sent'
                  ? 'color-mix(in srgb, var(--green) 22%, transparent)'
                  : 'color-mix(in srgb, var(--yellow) 22%, transparent)',
              }}
            >
              {failed
                ? 'STATUS: FAILED'
                : emailStatus === 'draft'
                ? 'EMAIL: DRAFT — NOT SENT'
                : `EMAIL: ${emailStatus.toUpperCase()}`}
            </span>
          </div>

          <div className="text-[10.5px] font-bold uppercase tracking-[0.6px] text-on-plate/70">
            Audit target
          </div>
          <h2 className="font-display text-[34px] leading-tight font-bold tracking-[-0.6px] text-on-plate break-words mt-1">
            {audit.targetUrl}
          </h2>

          {!failed && (
            <div className="flex flex-wrap items-center gap-3 mt-5">
              <button
                type="button"
                onClick={onOpenReport}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-[12.5px] font-semibold bg-fill-blue text-on-fill hover:bg-fill-blue-h transition-colors"
              >
                <FileText className="w-4 h-4" strokeWidth={1.5} />
                Generate Report
              </button>

              <button
                type="button"
                onClick={onOpenEmailModal}
                className={`${plateAction} border-yellow hover:bg-[color-mix(in_srgb,var(--yellow)_34%,transparent)]`}
                style={{ background: 'color-mix(in srgb, var(--yellow) 20%, transparent)' }}
              >
                {emailStatus === 'sent' ? (
                  <CheckCheck className="w-4 h-4" strokeWidth={1.5} />
                ) : (
                  <Mail className="w-4 h-4" strokeWidth={1.5} />
                )}
                {emailStatus === 'sent' ? 'Email Sent' : 'Email Report (Human Gate)'}
              </button>

              {audit.proxyUrl && (
                <a
                  href={audit.proxyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${plateAction} border-cyan hover:bg-[color-mix(in_srgb,var(--cyan)_34%,transparent)] !text-on-plate hover:!text-on-plate no-underline hover:no-underline`}
                  style={{ background: 'color-mix(in srgb, var(--cyan) 20%, transparent)' }}
                >
                  <ShieldCheck className="w-4 h-4" strokeWidth={1.5} />
                  Preview Corrected Site (Live Proxy)
                  <ExternalLink className="w-3.5 h-3.5 opacity-70" strokeWidth={1.5} />
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {failed && (
        <div
          className="px-6 py-4 border-b border-line2 flex items-start gap-2.5"
          style={{ background: 'color-mix(in srgb, var(--red) 10%, var(--bg))' }}
        >
          <AlertTriangle className="w-5 h-5 text-cred shrink-0 mt-0.5" strokeWidth={1.5} />
          <div>
            <div className="text-[13px] font-bold text-cred">
              Audit Execution Failed for Target Site
            </div>
            <p className="text-[12.5px] text-bodyp mt-1">
              {audit.error ||
                'The target URL could not be audited or the pipeline service encountered an unhandled execution error.'}
            </p>
          </div>
        </div>
      )}

      {/*
        Metric grid — cells split by 1px --line.

        Hidden entirely on a failed audit. A failure leaves violationsBefore at
        0 and violationsAfter null, which renders as "0 → 0, −0% violations" —
        indistinguishable from having measured a clean site. Nothing was
        measured, so nothing is shown.
      */}
      {!failed && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line">
        <Metric label="Measured axe-core Violations" note={`${fixedCount} violations resolved`}>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-display text-[46px] leading-none font-bold tracking-[-0.5px] text-cred line-through decoration-[3px]">
              {beforeN}
            </span>
            <ArrowRight className="w-4 h-4 text-bodyp shrink-0" strokeWidth={1.5} />
            <span className="font-display text-[46px] leading-none font-bold tracking-[-0.5px] text-cgreen">
              {afterN}
            </span>
            <span className="font-mono text-[11px] font-bold text-cgreen border border-green px-1.5 py-0.5">
              −{reductionPercentage}% violations
            </span>
          </div>
        </Metric>

        <Metric
          label="Verified Fixes"
          note="100% axe-core re-run verified"
          icon={<CheckCircle className="w-4 h-4 text-green" strokeWidth={1.5} />}
        >
          <span className="font-display text-[46px] leading-none font-bold tracking-[-0.5px] text-head">
            {verifiedN}
          </span>
        </Metric>

        <Metric
          label="Action Required"
          note="Requires Human Input (`alt` / context)"
          tinted
          icon={<AlertTriangle className="w-4 h-4 text-yellow" strokeWidth={1.5} />}
        >
          <span className="font-display text-[46px] leading-none font-bold tracking-[-0.5px] text-cyellow">
            {humanN}
          </span>
        </Metric>

        <Metric
          label="Pages Audited"
          note="Intake & Playwright Capture"
          icon={<FileText className="w-4 h-4 text-blue" strokeWidth={1.5} />}
        >
          <span className="font-display text-[46px] leading-none font-bold tracking-[-0.5px] text-head">
            {pagesN}
          </span>
        </Metric>
      </div>
      )}

      <div className="bg-sunk border-t border-line2 px-6 py-3 flex items-start gap-2 text-[12px] text-bodyp">
        <ShieldAlert className="w-4 h-4 text-ccyan shrink-0 mt-0.5" strokeWidth={1.5} />
        <span>
          <strong className="text-head font-semibold">Claim discipline:</strong> A11ySentinel{' '}
          <em>finds</em>, <em>prioritises</em>, <em>drafts</em>, and <em>verifies</em> fixes under
          human review.
        </span>
      </div>
    </section>
  );
};
