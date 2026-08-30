import React from 'react';
import { Audit } from '../types/schema';
import { ShieldCheck, ExternalLink, Globe, FileText, CheckCircle, AlertTriangle, ArrowRight, ShieldAlert, Mail, CheckCheck } from 'lucide-react';

interface AuditSummaryProps {
  audit: Audit;
  verifiedCount: number;
  humanInputCount: number;
  onOpenReport: () => void;
  onOpenEmailModal: () => void;
}

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

  return (
    <div className="glass-panel rounded-2xl p-6 mb-8 border border-slate-800 shadow-xl relative overflow-hidden">
      
      {/* Target URL Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-6 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-mono text-indigo-400 mb-1">
            <Globe className="w-3.5 h-3.5" />
            <span>Audit ID: {audit.auditId}</span>
            <span className="text-slate-600">•</span>
            <span>{new Date(audit.createdAt).toLocaleString('en-US')}</span>

            {/* Audit Status / Email Status Badge */}
            <span className="text-slate-600">•</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
              audit.status === 'failed'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : emailStatus === 'sent' 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                  : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
            }`}>
              {audit.status === 'failed' ? 'STATUS: FAILED' : `Email: ${emailStatus}`}
            </span>
          </div>
          <h2 className="text-2xl font-extrabold text-white flex items-center space-x-3">
            <span className="truncate max-w-xl">{audit.targetUrl}</span>
          </h2>
        </div>

        {/* Action Buttons: Report & Live Proxy Preview & Email Gate */}
        {audit.status !== 'failed' && (
          <div className="flex items-center space-x-3 shrink-0 flex-wrap gap-2">
            <button
              onClick={onOpenReport}
              className="inline-flex items-center space-x-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/20 transition"
            >
              <FileText className="w-4 h-4" />
              <span>Generate Report</span>
            </button>

            <button
              onClick={onOpenEmailModal}
              className={`inline-flex items-center space-x-2 px-4 py-3 rounded-xl font-bold text-sm shadow-lg transition border ${
                emailStatus === 'sent'
                  ? 'bg-slate-800 text-emerald-400 border-emerald-500/30'
                  : 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white border-amber-500/30 shadow-amber-600/20'
              }`}
            >
              {emailStatus === 'sent' ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Mail className="w-4 h-4" />}
              <span>{emailStatus === 'sent' ? 'Email Sent' : 'Email Report (Human Gate)'}</span>
            </button>

            {audit.proxyUrl && (
              <a
                href={audit.proxyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 transition group"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Preview Corrected Site (Live Proxy)</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-70 group-hover:translate-x-0.5 transition-transform" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Error Alert Banner when Audit Failed */}
      {(audit.status === 'failed' || audit.error) && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs space-y-2 mb-6">
          <div className="flex items-center space-x-2 font-bold text-rose-300 text-sm">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>Audit Execution Failed for Target Site</span>
          </div>
          <p className="text-slate-300">
            {audit.error || 'The target URL could not be audited or the pipeline service encountered an unhandled execution error.'}
          </p>
        </div>
      )}

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        
        {/* Before vs After violations counter */}
        <div className="glass-card rounded-xl p-4 border border-slate-800/80 relative overflow-hidden">
          <div className="text-xs text-slate-400 font-medium mb-1">Measured axe-core Violations</div>
          <div className="flex items-baseline space-x-3">
            <span className="text-3xl font-black text-rose-400 line-through opacity-80">{before}</span>
            <ArrowRight className="w-4 h-4 text-slate-500" />
            <span className="text-3xl font-black text-emerald-400">{after}</span>
          </div>
          <div className="mt-2 flex items-center space-x-1.5 text-xs text-emerald-400 font-semibold">
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
              -{reductionPercentage}% violations
            </span>
          </div>
        </div>

        {/* Verified Fixes Count */}
        <div className="glass-card rounded-xl p-4 border border-slate-800/80">
          <div className="text-xs text-slate-400 font-medium mb-1 flex items-center justify-between">
            <span>Verified Fixes</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-white">{verifiedCount}</div>
          <div className="mt-2 text-xs text-slate-400">
            100% axe-core re-run verified
          </div>
        </div>

        {/* Human Action Required Count */}
        <div className="glass-card rounded-xl p-4 border border-amber-500/20 bg-amber-500/5">
          <div className="text-xs text-amber-300 font-medium mb-1 flex items-center justify-between">
            <span>Action Required</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black text-amber-400">{humanInputCount}</div>
          <div className="mt-2 text-xs text-amber-200/70">
            Requires Human Input (`alt` / context)
          </div>
        </div>

        {/* Pages Scanned */}
        <div className="glass-card rounded-xl p-4 border border-slate-800/80">
          <div className="text-xs text-slate-400 font-medium mb-1 flex items-center justify-between">
            <span>Pages Audited</span>
            <FileText className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-3xl font-black text-white">{audit.pageCount}</div>
          <div className="mt-2 text-xs text-slate-400">
            Intake & Playwright Capture
          </div>
        </div>

      </div>

      {/* Claim Discipline Footer Disclaimer */}
      <div className="flex items-center space-x-2 text-xs text-slate-400 bg-slate-900/60 rounded-lg p-3 border border-slate-800">
        <ShieldAlert className="w-4 h-4 text-indigo-400 shrink-0" />
        <span>
          <strong className="text-slate-200">Claim discipline:</strong> A11ySentinel <em>finds</em>, <em>prioritises</em>, <em>drafts</em>, and <em>verifies</em> fixes under human review.
        </span>
      </div>

    </div>
  );
};
