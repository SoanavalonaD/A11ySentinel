import React from 'react';
import { AuditStatus } from '../types/schema';
import { Check } from 'lucide-react';

interface LiveProgressTrackerProps {
  status: AuditStatus;
  pageCount: number;
}

const ORDER: AuditStatus[] = [
  'queued',
  'capturing',
  'auditing',
  'remediating',
  'verifying',
  'complete',
];

export const LiveProgressTracker: React.FC<LiveProgressTrackerProps> = ({ status, pageCount }) => {
  const steps: { id: AuditStatus; label: string }[] = [
    { id: 'queued', label: '1. Intake Queue' },
    { id: 'capturing', label: `2. Playwright Capture (${pageCount} p.)` },
    { id: 'auditing', label: '3. axe-core & Multimodal Audit' },
    { id: 'remediating', label: '4. Gemini Patch Generation' },
    { id: 'verifying', label: '5. Re-audit & Verification' },
    { id: 'complete', label: '6. Audit Complete' },
  ];

  const currentIndex = ORDER.indexOf(status);

  const stateOf = (stepId: AuditStatus): 'done' | 'running' | 'queued' => {
    const stepIndex = ORDER.indexOf(stepId);
    if (stepIndex < currentIndex) return 'done';
    if (stepIndex === currentIndex) return 'running';
    return 'queued';
  };

  return (
    <section className="panel card-shadow p-5" aria-label="Pipeline progress">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.6px] text-head">
          Real-time ADK Agent Pipeline Progress
        </h3>
        <span className="font-mono text-[11px] text-cblue border border-line2 px-2 py-0.5">
          Stage: {status}
        </span>
      </div>

      <ol className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        {steps.map((step) => {
          const state = stateOf(step.id);

          // Every state carries a glyph AND a word — never colour alone.
          const chrome = {
            done: {
              box: 'border-green text-cgreen',
              fill: 'color-mix(in srgb, var(--green) 12%, var(--bg))',
              word: 'DONE',
            },
            running: {
              box: 'border-blue text-cblue',
              fill: 'color-mix(in srgb, var(--blue) 12%, var(--bg))',
              word: 'RUNNING',
            },
            queued: {
              box: 'border-line2 text-bodyp',
              fill: 'var(--sunk)',
              word: 'QUEUED',
            },
          }[state];

          return (
            <li
              key={step.id}
              aria-current={state === 'running' ? 'step' : undefined}
              className={`relative overflow-hidden border p-2.5 ${chrome.box}`}
              style={{ background: chrome.fill }}
            >
              {state === 'running' && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-0 h-[2px] w-1/3 bg-blue a11-bar"
                />
              )}

              <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[0.5px]">
                {state === 'done' && <Check className="w-3 h-3" strokeWidth={2} />}
                {state === 'running' && (
                  <span className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                )}
                {state === 'queued' && (
                  <span className="w-2.5 h-2.5 border border-dashed border-current rounded-full" />
                )}
                {chrome.word}
              </span>

              <span className="block text-[12.5px] font-semibold text-head mt-1 leading-tight">
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
