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
    onRunAudit({ url: url.trim(), visual, remediate, modelTriage });
  };

  const handleSelectPreset = (presetUrl: string) => {
    setUrl(presetUrl);
    onRunAudit({ url: presetUrl, visual: true, remediate: true, modelTriage: true });
  };

  const options = [
    {
      id: 'opt-visual',
      checked: visual,
      set: setVisual,
      Icon: Eye,
      tint: 'text-cviolet',
      label: 'Multimodal Visual Audit',
      sub: 'Gemini 3.7 Flash',
    },
    {
      id: 'opt-remediate',
      checked: remediate,
      set: setRemediate,
      Icon: Wrench,
      tint: 'text-cgreen',
      label: 'Patch Generation & Verification',
      sub: 'Remediator → Verifier',
    },
    {
      id: 'opt-triage',
      checked: modelTriage,
      set: setModelTriage,
      Icon: BarChart2,
      tint: 'text-cyellow',
      label: 'User Impact Triage',
      sub: 'TriageAgent',
    },
  ];

  return (
    <section className="panel card-shadow p-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-[21px] font-bold text-head flex items-center gap-2">
            <Search className="w-5 h-5 text-cblue" strokeWidth={1.5} />
            Run Autonomous Accessibility Audit
          </h2>
          <p className="text-[13px] text-bodyp mt-1 max-w-2xl">
            Finds violations, prioritises by user impact, drafts source code diffs, and verifies via{' '}
            <code className="font-mono text-[12px] text-cblue">axe-core</code> re-runs.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.5px] text-bodyp">
            Demo Presets:
          </span>
          <button
            type="button"
            onClick={() =>
              handleSelectPreset(
                'https://a11ysentinel-pipeline-708226575684.us-central1.run.app/demo/index.html'
              )
            }
            className="text-[11px] font-semibold border border-line2 text-cgreen px-2.5 py-1 hover:bg-sunk transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Sparkles className="w-3 h-3" strokeWidth={1.5} />
            Marché Antsahabe (21→4)
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset('https://www.w3.org/WAI/demos/bad/before/home.html')}
            className="text-[11px] font-semibold border border-line2 text-bodyp px-2.5 py-1 hover:bg-sunk hover:text-head transition-colors whitespace-nowrap"
          >
            WAI Before Demo
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-grow">
            <label
              htmlFor="audit-url"
              className="block text-[10.5px] font-bold uppercase tracking-[0.6px] text-bodyp mb-1.5"
            >
              Target URL
            </label>
            <div className="relative">
              <input
                id="audit-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                required
                className="w-full bg-sunk border border-line2 px-4 py-3 pl-10 text-[13px] font-mono text-head"
              />
              <Search
                className="w-4 h-4 text-bodyp absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth={1.5}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-3 bg-fill-blue hover:bg-fill-blue-h text-on-fill font-semibold text-[13px] flex items-center justify-center gap-2 shrink-0 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Auditing Site...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" strokeWidth={1.5} />
                <span>Audit Site</span>
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-line">
          {options.map(({ id, checked, set, Icon, tint, label, sub }) => (
            <label
              key={id}
              htmlFor={id}
              className="flex items-start gap-2.5 bg-sunk border border-line2 p-3 cursor-pointer hover:border-blue transition-colors"
            >
              <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={(e) => set(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-head">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${tint}`} strokeWidth={1.5} />
                  {label}
                </span>
                <span className="block font-mono text-[11px] text-bodyp mt-0.5">{sub}</span>
              </span>
            </label>
          ))}
        </div>

        <p className="border-l-2 border-cyan pl-3 py-1 text-[12px] text-bodyp leading-relaxed flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-ccyan shrink-0 mt-0.5" strokeWidth={1.5} />
          <span>
            <strong className="text-head font-semibold">Integrity Guardrail: </strong>
            A11ySentinel produces source diffs to merge into your codebase. It is not a runtime
            overlay widget. Every patch is verified by axe-core before write.
          </span>
        </p>
      </form>
    </section>
  );
};
