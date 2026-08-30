import React, { useState } from 'react';
import { Finding } from '../types/schema';
import { 
  CheckCircle, 
  AlertTriangle, 
  Eye, 
  Copy, 
  Check, 
  Volume2, 
  Code, 
  UserCheck, 
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  FileCode,
  Layers
} from 'lucide-react';

interface FindingCardProps {
  finding: Finding;
  onOpenHumanGuidance: (finding: Finding) => void;
}

export const FindingCard: React.FC<FindingCardProps> = ({ finding, onOpenHumanGuidance }) => {
  const [copiedSelector, setCopiedSelector] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  // Hard Rule 1: Never render 'patched' status findings
  if (finding.status === 'patched') {
    return null;
  }

  const isVerified = finding.status === 'verified';
  const isDetected = finding.status === 'detected';

  const copySelector = () => {
    navigator.clipboard.writeText(finding.selector);
    setCopiedSelector(true);
    setTimeout(() => setCopiedSelector(false), 2000);
  };

  // Severity styling
  const severityBadgeClass = {
    critical: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    serious: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    moderate: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    minor: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  }[finding.severity];

  return (
    <div className={`glass-card rounded-2xl border transition-all duration-200 overflow-hidden ${
      finding.requiresHumanInput 
        ? 'border-amber-500/40 bg-gradient-to-b from-amber-950/10 to-transparent' 
        : isVerified 
          ? 'border-slate-800 hover:border-slate-700' 
          : 'border-rose-500/30 bg-rose-950/5'
    }`}>
      
      {/* Card Header Bar */}
      <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/60">
        
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Status Badge */}
          {isVerified ? (
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Verified Patch</span>
            </span>
          ) : (
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Detected Violation (No Diff)</span>
            </span>
          )}

          {/* Human Input Badge */}
          {finding.requiresHumanInput && (
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse-slow">
              <UserCheck className="w-3.5 h-3.5" />
              <span>Action Required</span>
            </span>
          )}

          {/* Source Badge */}
          <span className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${
            finding.source === 'visual' 
              ? 'bg-purple-500/10 text-purple-300 border-purple-500/20' 
              : 'bg-slate-800 text-slate-300 border-slate-700'
          }`}>
            {finding.source === 'visual' ? <Eye className="w-3 h-3 text-purple-400" /> : <Code className="w-3 h-3 text-slate-400" />}
            <span className="capitalize">{finding.source === 'visual' ? 'VisualAuditor (Gemini)' : 'axe-core'}</span>
          </span>

          {/* Severity Badge */}
          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider border ${severityBadgeClass}`}>
            {finding.severity}
          </span>

        </div>

        {/* Criteria Tags */}
        <div className="flex items-center space-x-2 text-xs font-mono">
          <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-indigo-300 font-semibold">
            WCAG {finding.wcagCriterion}
          </span>

          {finding.regionalFramework && finding.regionalCriterion && (
            <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-emerald-300 font-semibold" title="Regional framework equivalent (contextual reference)">
              {finding.regionalFramework} {finding.regionalCriterion}
            </span>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded text-slate-400 hover:text-white transition ml-2"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

      </div>

      {/* Card Content Body */}
      {isExpanded && (
        <div className="p-5 space-y-5">
          
          {/* User Impact Plain-Language Description */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              User Impact (Plain-Language Consequence):
            </h4>
            <p className="text-sm text-slate-100 font-medium leading-relaxed bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
              {finding.userImpact}
            </p>
          </div>

          {/* Visual Auditor Evidence (if present) */}
          {finding.evidence && (
            <div className="bg-purple-950/20 border border-purple-500/20 rounded-xl p-3 text-xs text-purple-200/90 space-y-1">
              <span className="font-semibold text-purple-300 flex items-center gap-1">
                <Eye className="w-3.5 h-3.5 text-purple-400" />
                Multimodal Visual Finding:
              </span>
              <p>{finding.evidence}</p>
            </div>
          )}

          {/* Screen Reader Announcement Headline (Draft 3) */}
          {/* Render ONLY if announcedBefore is non-null */}
          {finding.announcedBefore !== null && finding.announcedAfter !== null && (
            <div className="glass-panel rounded-xl p-4 border border-indigo-500/20 bg-indigo-950/20 space-y-2">
              <div className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-indigo-400" />
                <span>Screen Reader Announcement (Chromium CDP)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-500/20 text-rose-300">
                  <span className="text-[10px] text-rose-400 uppercase block font-sans font-bold">Before Patch:</span>
                  {finding.announcedBefore}
                </div>
                <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/20 text-emerald-300">
                  <span className="text-[10px] text-emerald-400 uppercase block font-sans font-bold">After Patch:</span>
                  {finding.announcedAfter}
                </div>
              </div>
            </div>
          )}

          {/* Element Selector & XPath */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>CSS Selector:</span>
              <button
                onClick={copySelector}
                className="flex items-center space-x-1 text-slate-400 hover:text-indigo-400 transition"
              >
                {copiedSelector ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSelector ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-indigo-300 truncate">
              {finding.selector}
            </div>
          </div>

          {/* Requires Human Input Warning Banner */}
          {finding.requiresHumanInput && (
            <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-amber-300 font-bold text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Requires human review</span>
                </div>
                <button
                  onClick={() => onOpenHumanGuidance(finding)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs font-semibold transition"
                >
                  View editing guidance
                </button>
              </div>
              <p className="text-xs text-amber-200/80 leading-relaxed">
                {finding.humanGuidance}
              </p>
            </div>
          )}

          {/* CODE DIFF VIEWER (ONLY FOR VERIFIED FINDINGS) */}
          {/* Hard Rule 1 & 2: Show code diff ONLY when status == 'verified' */}
          {isVerified && finding.patchedCode ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                  Verified Source Code Diff:
                </h5>
                {finding.changeSummary && (
                  <span className="text-xs text-emerald-400 font-medium italic">
                    "{finding.changeSummary}"
                  </span>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 overflow-hidden font-mono text-xs shadow-inner">
                {/* Original Code */}
                <div className="diff-removed p-3 overflow-x-auto">
                  <span className="text-[10px] text-rose-400 uppercase block font-sans font-bold mb-1">- Original Code:</span>
                  <code>{finding.currentCode}</code>
                </div>

                {/* Patched Code */}
                <div className="diff-added p-3 overflow-x-auto">
                  <span className="text-[10px] text-emerald-400 uppercase block font-sans font-bold mb-1">+ Verified Patch:</span>
                  <code>{finding.patchedCode}</code>
                </div>
              </div>
            </div>
          ) : isDetected ? (
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                <strong>Detected Status:</strong> Real violation confirmed by axe-core. No code patch has survived verification yet.
              </span>
            </div>
          ) : null}

        </div>
      )}

    </div>
  );
};
