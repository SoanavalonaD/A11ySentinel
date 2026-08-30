import React from 'react';
import { Audit, Finding } from '../types/schema';
import { downloadMarkdownFile } from '../utils/reportExporter';
import {
  Download,
  Printer,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  ShieldAlert,
  Volume2,
  UserCheck,
  Layers,
  Globe,
  FileText,
} from 'lucide-react';

interface RemediationReportProps {
  audit: Audit;
  findings: Finding[];
  onBackToDashboard: () => void;
}

const SectionHead: React.FC<{ n: number; icon: React.ReactNode; children: React.ReactNode }> = ({
  n,
  icon,
  children,
}) => (
  <h2 className="flex items-center gap-2.5 text-[21px] font-bold text-head border-b border-line2 pb-2 mb-4">
    <span className="font-display text-[15px] font-bold text-on-plate bg-plate px-2 py-0.5 leading-tight shrink-0">
      {String(n).padStart(2, '0')}
    </span>
    {icon}
    <span className="min-w-0">{children}</span>
  </h2>
);

export const RemediationReport: React.FC<RemediationReportProps> = ({
  audit,
  findings,
  onBackToDashboard,
}) => {
  const dateStr = new Date(audit.createdAt).toLocaleString('en-US');
  const before = audit.violationsBefore;
  const after = audit.violationsAfter !== null ? audit.violationsAfter : before;
  const reduction = before > 0 ? Math.round(((before - after) / before) * 100) : 0;

  const verifiedFindings = findings.filter((f) => f.status === 'verified');
  const humanFindings = findings.filter((f) => f.requiresHumanInput);
  const detectedFindings = findings.filter((f) => f.status === 'detected');

  const metaCell = (label: string, value: React.ReactNode) => (
    <div className="p-3 bg-panel">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.6px] text-bodyp">{label}</div>
      <div className="font-mono text-[12.5px] text-head mt-1 break-words">{value}</div>
    </div>
  );

  return (
    <div className="flex-grow bg-bg py-8 px-4">
      <div className="max-w-[920px] mx-auto mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print-hide">
        <button
          type="button"
          onClick={onBackToDashboard}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-line2 text-[12.5px] font-semibold text-bodyp hover:text-head hover:bg-panel transition-colors"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          Back to Dashboard
        </button>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => downloadMarkdownFile(audit, findings)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-fill-blue hover:bg-fill-blue-h text-on-fill text-[12.5px] font-semibold transition-colors"
          >
            <Download className="w-4 h-4" strokeWidth={1.5} />
            Download Markdown (.md)
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-line2 text-[12.5px] font-semibold text-bodyp hover:text-head hover:bg-panel transition-colors"
          >
            <Printer className="w-4 h-4" strokeWidth={1.5} />
            Print / Save as PDF
          </button>
        </div>
      </div>

      <article className="max-w-[920px] mx-auto panel card-shadow px-6 py-8 sm:px-[52px] sm:py-11 space-y-10">
        {/* Masthead */}
        <header className="border-b-2 border-head pb-6">
          <div className="font-display text-[13px] font-bold uppercase tracking-[1.4px] text-cblue">
            A11ySentinel Remediation Document
          </div>
          <h1 className="text-[32px] leading-tight font-bold text-head tracking-[-0.5px] mt-2">
            Accessibility Audit &amp; Patch Verification Report
          </h1>
          <div className="font-mono text-[12px] text-bodyp mt-2">ID: {audit.auditId}</div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-line border border-line2">
          {metaCell('Target URL', audit.targetUrl)}
          {metaCell('Audit Date', dateStr)}
          {metaCell('Pages Scanned', `${audit.pageCount} page(s)`)}
        </div>

        {/* 1 — Measured summary */}
        <section>
          <SectionHead n={1} icon={<FileText className="w-5 h-5 text-cblue shrink-0" strokeWidth={1.5} />}>
            Executive Summary &amp; Impact Metrics
          </SectionHead>

          <table className="w-full border border-line2 text-[13px]">
            <caption className="sr-only">Measured audit results</caption>
            <tbody>
              <tr className="border-b border-line">
                <th scope="row" className="text-left font-semibold text-bodyp p-3 w-1/2">
                  axe-core violations (before → after)
                </th>
                <td className="p-3 font-mono">
                  <span className="text-cred line-through decoration-[2px]">{before}</span>
                  <span aria-hidden="true" className="text-bodyp mx-2">
                    →
                  </span>
                  <span className="text-cgreen font-bold">{after}</span>
                  <span className="text-cgreen ml-2">(−{reduction}%)</span>
                </td>
              </tr>
              <tr className="border-b border-line">
                <th scope="row" className="text-left font-semibold text-bodyp p-3">
                  Verified source patches
                </th>
                <td className="p-3 font-mono text-head">{verifiedFindings.length}</td>
              </tr>
              <tr>
                <th scope="row" className="text-left font-semibold text-bodyp p-3">
                  Action required — human content review
                </th>
                <td className="p-3 font-mono text-cyellow">{humanFindings.length}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 2 — Standards */}
        <section>
          <SectionHead n={2} icon={<Globe className="w-5 h-5 text-cblue shrink-0" strokeWidth={1.5} />}>
            Technical Standard &amp; Scope
          </SectionHead>
          <ul className="space-y-2 text-[13px] text-bodyp">
            <li>
              <strong className="text-head font-semibold">Primary Global Standard:</strong> WCAG 2.1
              AA (Web Content Accessibility Guidelines).
            </li>
            <li>
              <strong className="text-head font-semibold">Regional Cross-Reference:</strong> RGAA 4
              (Référentiel Général d'Amélioration de l'Accessibilité) criteria mapped as contextual
              reference.
            </li>
            <li>
              <strong className="text-head font-semibold">Evaluation Engines:</strong> Deterministic
              ground truth provided by <code className="font-mono text-cblue">axe-core 4.10.2</code>{' '}
              and multimodal visual inspection provided by{' '}
              <code className="font-mono text-cblue">Gemini 3.7 Flash</code>.
            </li>
          </ul>
        </section>

        {/* 3 — Verified patches */}
        <section>
          <SectionHead
            n={3}
            icon={<CheckCircle className="w-5 h-5 text-cgreen shrink-0" strokeWidth={1.5} />}
          >
            Verified Source-Level Fixes ({verifiedFindings.length})
          </SectionHead>

          <div className="space-y-5">
            {verifiedFindings.map((f, idx) => (
              <div key={f.findingId} className="border border-line2 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-[13px] font-bold text-on-plate bg-plate px-1.5 leading-tight">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[14px] font-bold text-head">{f.category}</span>
                    <span className="font-mono text-[11px] px-2 py-0.5 border border-line2 text-cblue font-semibold">
                      WCAG {f.wcagCriterion}
                    </span>
                    {f.regionalFramework && f.regionalCriterion && (
                      <span className="font-mono text-[11px] px-2 py-0.5 border border-line2 text-ccyan font-semibold">
                        {f.regionalFramework} {f.regionalCriterion}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[11px] text-bodyp">{f.findingId}</span>
                </div>

                <p className="text-[13px] text-head bg-sunk border border-line p-3">{f.userImpact}</p>

                {f.evidence && (
                  <p
                    className="text-[12.5px] text-bodyp border border-violet p-3"
                    style={{ background: 'color-mix(in srgb, var(--violet) 8%, var(--bg))' }}
                  >
                    <strong className="block text-[10.5px] font-bold uppercase tracking-[0.6px] text-cviolet mb-1">
                      Multimodal Visual Evidence:
                    </strong>
                    {f.evidence}
                  </p>
                )}

                {f.announcedBefore !== null && f.announcedAfter !== null && (
                  <div
                    className="border border-cyan p-3"
                    style={{ background: 'color-mix(in srgb, var(--cyan) 10%, var(--bg))' }}
                  >
                    <div className="flex items-center gap-2 text-[12.5px] font-bold text-ccyan mb-2">
                      <Volume2 className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                      Screen Reader Announcement Delta (Chromium CDP)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-[12.5px]">
                      <div className="bg-sunk border border-red p-2">
                        <span className="block font-sans text-[10px] font-bold uppercase tracking-[0.6px] text-cred mb-0.5">
                          Before Patch:
                        </span>
                        <span className="text-head break-words">{f.announcedBefore}</span>
                      </div>
                      <div className="bg-sunk border border-green p-2">
                        <span className="block font-sans text-[10px] font-bold uppercase tracking-[0.6px] text-cgreen mb-0.5">
                          After Patch:
                        </span>
                        <span className="text-head break-words">{f.announcedAfter}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.6px] text-bodyp mb-1">
                    CSS Selector:
                  </div>
                  <div className="code-surface border border-line2 p-2 text-[12.5px] text-head overflow-x-auto">
                    {f.selector}
                  </div>
                </div>

                {f.patchedCode && (
                  <div>
                    <div className="flex items-center justify-between gap-3 flex-wrap text-[10.5px] font-bold uppercase tracking-[0.6px] text-bodyp mb-1">
                      <span>Verified Code Diff:</span>
                      {f.changeSummary && (
                        <span className="text-cgreen italic normal-case tracking-normal font-normal text-[12px]">
                          "{f.changeSummary}"
                        </span>
                      )}
                    </div>
                    <div className="border border-line2 font-mono text-[12.5px]">
                      <div className="diff-removed p-2.5 overflow-x-auto">
                        <span className="block font-sans text-[10px] font-bold uppercase tracking-[0.6px] mb-0.5">
                          − Original
                        </span>
                        <code className="text-head">{f.currentCode}</code>
                      </div>
                      <div className="diff-added p-2.5 overflow-x-auto">
                        <span className="block font-sans text-[10px] font-bold uppercase tracking-[0.6px] mb-0.5">
                          + Verified Patch
                        </span>
                        <code className="text-head">{f.patchedCode}</code>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* 4 — Action required */}
        {humanFindings.length > 0 && (
          <section>
            <SectionHead
              n={4}
              icon={<UserCheck className="w-5 h-5 text-cyellow shrink-0" strokeWidth={1.5} />}
            >
              Action Required — Human Content Review ({humanFindings.length})
            </SectionHead>

            <div className="space-y-4">
              {humanFindings.map((f, idx) => (
                <div
                  key={f.findingId}
                  className="border border-yellow p-4 space-y-2"
                  style={{ background: 'color-mix(in srgb, var(--yellow) 8%, var(--bg))' }}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap text-[12.5px] font-bold text-cyellow">
                    <span>
                      {idx + 1}. {f.category} — WCAG {f.wcagCriterion}
                    </span>
                    <span className="font-mono text-bodyp font-normal">{f.findingId}</span>
                  </div>
                  <p className="text-[12.5px] text-bodyp leading-relaxed">
                    <strong className="block text-head font-semibold mb-0.5">Author Guidance:</strong>
                    {f.humanGuidance}
                  </p>
                  {f.patchedCode && (
                    <div className="code-surface border border-line2 p-2.5 font-mono text-[12.5px] text-head overflow-x-auto">
                      <span className="block font-sans text-[10px] font-bold uppercase tracking-[0.6px] text-bodyp mb-1">
                        Generated patch containing placeholder:
                      </span>
                      <code>{f.patchedCode}</code>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 5 — Detected, unpatched */}
        {detectedFindings.length > 0 && (
          <section>
            <SectionHead
              n={5}
              icon={<Layers className="w-5 h-5 text-cred shrink-0" strokeWidth={1.5} />}
            >
              Detected Violations Pending Patch Verification ({detectedFindings.length})
            </SectionHead>

            <div className="space-y-2">
              {detectedFindings.map((f) => (
                <div
                  key={f.findingId}
                  className="border border-line2 p-3 flex flex-col sm:flex-row sm:items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <span className="text-[12.5px] font-bold text-cred">
                      [{f.severity.toUpperCase()}] WCAG {f.wcagCriterion} — {f.category}
                    </span>
                    <p className="text-[12.5px] text-bodyp mt-0.5">{f.userImpact}</p>
                  </div>
                  <code className="font-mono text-[11px] text-bodyp code-surface border border-line px-2 py-1 shrink-0 max-w-full overflow-x-auto">
                    {f.selector}
                  </code>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Claim discipline */}
        <section className="bg-sunk border border-line2 p-4">
          <h2 className="flex items-center gap-2 text-[12.5px] font-bold text-ccyan mb-1.5">
            <ShieldAlert className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            Claim Discipline &amp; Responsible Use Statement
          </h2>
          <p className="text-[12.5px] text-bodyp leading-relaxed">
            A11ySentinel <em>finds</em>, <em>prioritises</em>, <em>drafts</em>, and <em>verifies</em>{' '}
            accessibility fixes under human review. It produces mergeable source-level code diffs. It
            is <strong className="text-head font-semibold">not</strong> a client-side runtime overlay
            widget and does not claim automatic 100% legal compliance.
          </p>
        </section>

        <footer className="border-t border-line2 pt-5 text-center text-[11px] text-bodyp space-y-1">
          <p>A11ySentinel — Autonomous Accessibility Remediation Agent</p>
          <p className="font-mono">
            Generated on {dateStr} · Audit ID: {audit.auditId}
          </p>
        </footer>
      </article>
    </div>
  );
};
