import React from 'react';
import { Audit, Finding } from '../types/schema';
import { downloadMarkdownFile } from '../utils/reportExporter';
import { 
  ShieldCheck, 
  Download, 
  Printer, 
  ArrowLeft, 
  FileText, 
  CheckCircle, 
  AlertTriangle, 
  Globe, 
  ShieldAlert,
  Volume2,
  FileCode,
  UserCheck,
  Layers
} from 'lucide-react';

interface RemediationReportProps {
  audit: Audit;
  findings: Finding[];
  onBackToDashboard: () => void;
}

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

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadMd = () => {
    downloadMarkdownFile(audit, findings);
  };

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 p-4 sm:p-8 font-sans print:bg-white print:text-black">
      
      {/* Top Action Bar (Hidden on print) */}
      <div className="max-w-5xl mx-auto mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <button
          onClick={onBackToDashboard}
          className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-400 hover:text-white transition bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </button>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleDownloadMd}
            className="inline-flex items-center space-x-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl transition shadow-lg shadow-indigo-600/20"
          >
            <Download className="w-4 h-4" />
            <span>Download Markdown (.md)</span>
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center space-x-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl transition shadow-lg shadow-emerald-600/20"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save as PDF</span>
          </button>
        </div>
      </div>

      {/* Main Report Document Container */}
      <div className="max-w-5xl mx-auto glass-panel rounded-3xl p-6 sm:p-10 border border-slate-800 shadow-2xl space-y-10 print:glass-none print:shadow-none print:border-none print:p-0">
        
        {/* Document Header */}
        <div className="border-b border-slate-800 pb-8 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-mono uppercase tracking-widest text-indigo-400 font-bold">
                  A11ySentinel Remediation Document
                </span>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Accessibility Audit & Patch Verification Report
                </h1>
              </div>
            </div>
            <span className="text-xs font-mono text-slate-400 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 hidden sm:inline-block">
              ID: {audit.auditId}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-sans font-semibold">Target URL:</span>
              <span className="text-indigo-300 font-bold truncate block">{audit.targetUrl}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-sans font-semibold">Audit Date:</span>
              <span className="text-slate-200">{dateStr}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-sans font-semibold">Pages Scanned:</span>
              <span className="text-slate-200">{audit.pageCount} page(s)</span>
            </div>
          </div>
        </div>

        {/* Section 1: Executive Summary & Metrics */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            <span>1. Executive Summary & Impact Metrics</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-card rounded-2xl p-5 border border-slate-800">
              <div className="text-xs text-slate-400 font-medium mb-1">axe-core Violations (Before → After)</div>
              <div className="text-3xl font-black">
                <span className="text-rose-400 line-through mr-2">{before}</span>
                <span className="text-emerald-400">{after}</span>
              </div>
              <div className="mt-2 text-xs font-bold text-emerald-400">
                -{reduction}% net reduction
              </div>
            </div>

            <div className="glass-card rounded-2xl p-5 border border-emerald-500/20 bg-emerald-500/5">
              <div className="text-xs text-emerald-300 font-medium mb-1 flex justify-between">
                <span>Verified Source Patches</span>
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-black text-emerald-400">{verifiedFindings.length}</div>
              <div className="mt-2 text-xs text-slate-400">
                100% verified by rule re-run
              </div>
            </div>

            <div className="glass-card rounded-2xl p-5 border border-amber-500/20 bg-amber-500/5">
              <div className="text-xs text-amber-300 font-medium mb-1 flex justify-between">
                <span>Action Required Items</span>
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-3xl font-black text-amber-400">{humanFindings.length}</div>
              <div className="mt-2 text-xs text-amber-200/70">
                Requires human content review
              </div>
            </div>
          </div>

          <div className="bg-slate-900/80 rounded-2xl p-4 border border-slate-800 text-xs text-slate-300 space-y-1">
            <div className="font-bold text-indigo-400 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-indigo-400" />
              <span>Claim Discipline & Responsible Use Statement</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              A11ySentinel <em>finds</em>, <em>prioritises</em>, <em>drafts</em>, and <em>verifies</em> accessibility fixes under human review. It produces mergeable source-level code diffs. It is <strong>not</strong> a client-side runtime overlay widget and does not claim automatic 100% legal compliance.
            </p>
          </div>
        </section>

        {/* Section 2: Technical Standard Scope */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-2">
            <Globe className="w-5 h-5 text-indigo-400" />
            <span>2. Technical Standard & Scope</span>
          </h2>
          <div className="text-xs text-slate-300 space-y-2 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
            <p>
              • <strong>Primary Global Standard:</strong> WCAG 2.1 AA (Web Content Accessibility Guidelines).
            </p>
            <p>
              • <strong>Regional Cross-Reference:</strong> RGAA 4 (Référentiel Général d'Amélioration de l'Accessibilité) criteria mapped as contextual reference.
            </p>
            <p>
              • <strong>Evaluation Engines:</strong> Deterministic ground truth provided by <code className="text-indigo-300 font-mono">axe-core 4.10.2</code> and multimodal visual inspection provided by <code className="text-indigo-300 font-mono">Gemini 3.7 Flash</code>.
            </p>
          </div>
        </section>

        {/* Section 3: Verified Source Fixes */}
        <section className="space-y-6">
          <h2 className="text-lg font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <span>3. Verified Source-Level Fixes ({verifiedFindings.length})</span>
          </h2>

          <div className="space-y-6">
            {verifiedFindings.map((f, idx) => (
              <div key={f.findingId} className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
                
                {/* Finding Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-white text-sm">{f.category}</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-900 text-indigo-300 font-semibold">
                      WCAG {f.wcagCriterion}
                    </span>
                    {f.regionalFramework && f.regionalCriterion && (
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-900 text-emerald-300 font-semibold">
                        {f.regionalFramework} {f.regionalCriterion}
                      </span>
                    )}
                  </div>

                  <span className="text-xs font-mono text-slate-500">ID: {f.findingId}</span>
                </div>

                {/* User Impact */}
                <div className="text-xs text-slate-300 space-y-1">
                  <span className="font-semibold text-slate-400 block uppercase text-[10px]">User Impact:</span>
                  <p className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">{f.userImpact}</p>
                </div>

                {/* Multimodal visual evidence */}
                {f.evidence && (
                  <div className="text-xs text-purple-300 bg-purple-950/20 p-3 rounded-xl border border-purple-500/20">
                    <strong className="block text-[10px] uppercase text-purple-400 mb-0.5">Multimodal Visual Evidence:</strong>
                    {f.evidence}
                  </div>
                )}

                {/* Screen Reader Announcement Comparison */}
                {f.announcedBefore !== null && f.announcedAfter !== null && (
                  <div className="p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-xs space-y-2">
                    <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
                      <Volume2 className="w-4 h-4 text-indigo-400" />
                      <span>Screen Reader Announcement Delta (Chromium CDP):</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                      <div className="p-2 rounded bg-rose-950/30 border border-rose-500/20 text-rose-300">
                        <span className="text-[10px] text-rose-400 block uppercase font-sans font-bold">Before Patch:</span>
                        {f.announcedBefore}
                      </div>
                      <div className="p-2 rounded bg-emerald-950/30 border border-emerald-500/20 text-emerald-300">
                        <span className="text-[10px] text-emerald-400 block uppercase font-sans font-bold">After Patch:</span>
                        {f.announcedAfter}
                      </div>
                    </div>
                  </div>
                )}

                {/* CSS Selector */}
                <div className="text-xs font-mono">
                  <span className="text-slate-500 text-[10px] uppercase block font-sans font-semibold">CSS Selector:</span>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800 text-indigo-300 truncate">
                    {f.selector}
                  </div>
                </div>

                {/* Code Diff */}
                {f.patchedCode && (
                  <div className="space-y-1.5 font-mono text-xs">
                    <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-sans font-semibold">
                      <span>Verified Code Diff:</span>
                      {f.changeSummary && <span className="text-emerald-400 font-normal italic">"{f.changeSummary}"</span>}
                    </div>
                    <div className="rounded-xl border border-slate-800 overflow-hidden shadow-inner">
                      <div className="diff-removed p-2.5">
                        <span className="text-[10px] text-rose-400 block uppercase font-sans font-bold mb-0.5">- Original Code:</span>
                        <code>{f.currentCode}</code>
                      </div>
                      <div className="diff-added p-2.5">
                        <span className="text-[10px] text-emerald-400 block uppercase font-sans font-bold mb-0.5">+ Verified Patch:</span>
                        <code>{f.patchedCode}</code>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            ))}
          </div>
        </section>

        {/* Section 4: Action Required Items (Human Review) */}
        {humanFindings.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-amber-400 flex items-center space-x-2 border-b border-amber-500/30 pb-2">
              <UserCheck className="w-5 h-5 text-amber-400" />
              <span>4. Action Required — Human Content Review ({humanFindings.length})</span>
            </h2>

            <div className="space-y-4">
              {humanFindings.map((f, idx) => (
                <div key={f.findingId} className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-6 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                    <span>{idx + 1}. {f.category} — WCAG {f.wcagCriterion}</span>
                    <span className="font-mono text-slate-400">{f.findingId}</span>
                  </div>
                  <div className="text-xs text-amber-200/90 leading-relaxed bg-amber-950/40 p-3 rounded-xl border border-amber-500/20">
                    <strong className="block text-amber-300 mb-1">Author Guidance:</strong>
                    {f.humanGuidance}
                  </div>
                  <div className="text-xs font-mono text-amber-300 bg-slate-950 p-3 rounded-xl border border-amber-500/30">
                    <span className="text-[10px] text-amber-400 uppercase block font-sans font-semibold mb-1">Generated Patch containing placeholder:</span>
                    <code>{f.patchedCode}</code>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section 5: Unpatched / Detected Violations */}
        {detectedFindings.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-rose-400 flex items-center space-x-2 border-b border-rose-500/30 pb-2">
              <Layers className="w-5 h-5 text-rose-400" />
              <span>5. Detected Violations Pending Patch Verification ({detectedFindings.length})</span>
            </h2>

            <div className="space-y-2 text-xs">
              {detectedFindings.map((f) => (
                <div key={f.findingId} className="bg-rose-950/20 border border-rose-500/20 p-3.5 rounded-xl flex items-start justify-between gap-3 text-rose-200">
                  <div>
                    <span className="font-bold text-rose-300">[{f.severity.toUpperCase()}] WCAG {f.wcagCriterion} — {f.category}</span>
                    <p className="text-slate-300 mt-0.5">{f.userImpact}</p>
                  </div>
                  <code className="text-[11px] text-slate-400 shrink-0 font-mono bg-slate-900 px-2 py-1 rounded">
                    {f.selector}
                  </code>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Document Footer */}
        <div className="border-t border-slate-800 pt-6 text-center text-xs text-slate-500 space-y-1">
          <p>A11ySentinel — Autonomous Accessibility Remediation Agent</p>
          <p className="font-mono text-[11px]">Generated on {dateStr} • Audit ID: {audit.auditId}</p>
        </div>

      </div>

    </div>
  );
};
