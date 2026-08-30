import React from 'react';
import { AuditStatus } from '../types/schema';
import { CheckCircle2, Clock, Cpu, Eye, Wrench, ShieldCheck, Loader2 } from 'lucide-react';

interface LiveProgressTrackerProps {
  status: AuditStatus;
  pageCount: number;
}

export const LiveProgressTracker: React.FC<LiveProgressTrackerProps> = ({ status, pageCount }) => {
  const steps: { id: AuditStatus; label: string; icon: any }[] = [
    { id: 'queued', label: '1. Intake Queue', icon: Clock },
    { id: 'capturing', label: `2. Playwright Capture (${pageCount} p.)`, icon: Cpu },
    { id: 'auditing', label: '3. axe-core & Multimodal Audit', icon: Eye },
    { id: 'remediating', label: '4. Gemini Patch Generation', icon: Wrench },
    { id: 'verifying', label: '5. Re-audit & Verification', icon: ShieldCheck },
    { id: 'complete', label: '6. Audit Complete', icon: CheckCircle2 },
  ];

  const getStepState = (stepId: AuditStatus) => {
    const order: AuditStatus[] = ['queued', 'capturing', 'auditing', 'remediating', 'verifying', 'complete'];
    const currentIndex = order.indexOf(status);
    const stepIndex = order.indexOf(stepId);

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'upcoming';
  };

  return (
    <div className="glass-panel rounded-2xl p-5 mb-8 border border-indigo-500/20 bg-indigo-950/10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
          Real-time ADK Agent Pipeline Progress
        </h3>
        <span className="text-xs font-mono text-indigo-300 capitalize bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-md">
          Stage: {status}
        </span>
      </div>

      {/* Steps bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        {steps.map((step) => {
          const state = getStepState(step.id);
          const Icon = step.icon;

          return (
            <div
              key={step.id}
              className={`p-2.5 rounded-xl border text-xs font-medium transition flex flex-col items-center text-center gap-1.5 ${
                state === 'completed'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : state === 'current'
                  ? 'bg-indigo-600/20 border-indigo-500 text-white font-bold ring-2 ring-indigo-500/30 animate-pulse'
                  : 'bg-slate-900/40 border-slate-800 text-slate-500'
              }`}
            >
              <Icon className={`w-4 h-4 ${state === 'completed' ? 'text-emerald-400' : state === 'current' ? 'text-indigo-400' : 'text-slate-600'}`} />
              <span className="text-[11px] leading-tight">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
