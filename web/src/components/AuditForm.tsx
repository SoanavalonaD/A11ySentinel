import React, { useState } from 'react';
import { Search, Eye, Wrench, BarChart2, Play, Sparkles, AlertCircle } from 'lucide-react';
import { AuditRequestPayload } from '../services/api';

interface AuditFormProps {
  onRunAudit: (payload: AuditRequestPayload) => void;
  isLoading: boolean;
}

export const AuditForm: React.FC<AuditFormProps> = ({ onRunAudit, isLoading }) => {
  const [url, setUrl] = useState('https://demo-target.a11ysentinel.dev');
  const [visual, setVisual] = useState(true);
  const [remediate, setRemediate] = useState(true);
  const [modelTriage, setModelTriage] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    onRunAudit({
      url: url.trim(),
      visual,
      remediate,
      modelTriage
    });
  };

  const handleSelectPreset = (presetUrl: string) => {
    setUrl(presetUrl);
    onRunAudit({
      url: presetUrl,
      visual: true,
      remediate: true,
      modelTriage: true
    });
  };

  return (
    <div className="glass-panel rounded-2xl p-6 mb-8 border border-slate-800 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Search className="w-5 h-5 text-indigo-400" />
            Run Autonomous Accessibility Audit
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Finds violations, prioritises by user impact, drafts source code diffs, and verifies via <code className="text-indigo-300 font-mono text-xs bg-slate-900 px-1.5 py-0.5 rounded">axe-core</code> re-runs.
          </p>
        </div>

        {/* Quick Demo target presets */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500 font-medium">Demo Presets:</span>
          <button
            type="button"
            onClick={() => handleSelectPreset('https://a11ysentinel-pipeline-708226575684.us-central1.run.app/demo/index.html')}
            className="text-xs bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 rounded-md transition font-medium flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3 text-emerald-400" />
            Marché Antsahabe (21→4)
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset('https://www.w3.org/WAI/demos/bad/before/home.html')}
            className="text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 px-2.5 py-1 rounded-md transition font-medium"
          >
            WAI Before Demo
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-grow">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
              className="w-full glass-input rounded-xl px-4 py-3.5 pl-11 text-white placeholder-slate-500 focus:outline-none transition text-sm font-mono"
            />
            <Search className="w-5 h-5 text-slate-500 absolute left-3.5 top-3.5" />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold rounded-xl transition shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 text-sm disabled:opacity-50 shrink-0"
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>Auditing Site...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Audit Site</span>
              </>
            )}
          </button>
        </div>

        {/* Options pipeline switches */}
        <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-slate-800/80 text-xs">
          <label className="flex items-center gap-2 text-slate-300 cursor-pointer hover:text-white transition">
            <input
              type="checkbox"
              checked={visual}
              onChange={(e) => setVisual(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500/20"
            />
            <Eye className="w-3.5 h-3.5 text-indigo-400" />
            <span>Multimodal Visual Audit (Gemini 3.7 Flash)</span>
          </label>

          <label className="flex items-center gap-2 text-slate-300 cursor-pointer hover:text-white transition">
            <input
              type="checkbox"
              checked={remediate}
              onChange={(e) => setRemediate(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500/20"
            />
            <Wrench className="w-3.5 h-3.5 text-emerald-400" />
            <span>Patch Generation & Verification</span>
          </label>

          <label className="flex items-center gap-2 text-slate-300 cursor-pointer hover:text-white transition">
            <input
              type="checkbox"
              checked={modelTriage}
              onChange={(e) => setModelTriage(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500/20"
            />
            <BarChart2 className="w-3.5 h-3.5 text-amber-400" />
            <span>User Impact Triage</span>
          </label>
        </div>

        {/* Guardrail Disclaimer Banner */}
        <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-lg p-3 text-[11px] text-indigo-200/90 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-indigo-300">Integrity Guardrail: </span>
            A11ySentinel produces source diffs to merge into your codebase. It is not a runtime overlay widget. Every patch is verified by axe-core before write.
          </div>
        </div>
      </form>
    </div>
  );
};
