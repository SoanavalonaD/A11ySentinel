import React from 'react';
import { Finding } from '../types/schema';
import { AlertTriangle, X, Check, FileText, UserCheck, HelpCircle } from 'lucide-react';

interface HumanGuidanceModalProps {
  finding: Finding | null;
  onClose: () => void;
}

export const HumanGuidanceModal: React.FC<HumanGuidanceModalProps> = ({ finding, onClose }) => {
  if (!finding) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel w-full max-w-2xl rounded-2xl border border-amber-500/30 p-6 shadow-2xl relative space-y-4">
        
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                  Human Action Required
                </span>
                <span className="text-xs font-mono text-slate-400">{finding.findingId}</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-1">
                {finding.category} — Editorial Guidance
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Why human input is required */}
        <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-200/90 leading-relaxed">
          <div className="font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Why did the model refrain from inventing this content?
          </div>
          A11ySentinel never invents context or alt text when editorial intent is unknown. An explicit placeholder was inserted into the code patch for human review.
        </div>

        {/* Human Guidance details */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
            Human author guidance:
          </h4>
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-sm text-slate-200 font-sans leading-relaxed">
            {finding.humanGuidance}
          </div>
        </div>

        {/* Code Snippet with TODO placeholder */}
        <div className="space-y-2">
          <div className="text-xs font-mono text-slate-400">Generated patch containing TODO placeholder:</div>
          <pre className="p-3 rounded-lg bg-[#070a10] border border-amber-500/30 text-xs font-mono text-amber-300 overflow-x-auto">
            {finding.patchedCode}
          </pre>
        </div>

        {/* Action Button */}
        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition"
          >
            Close and return to findings
          </button>
        </div>

      </div>
    </div>
  );
};
