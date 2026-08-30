import React, { useEffect, useRef } from 'react';
import { Finding } from '../types/schema';
import { X, UserCheck, HelpCircle, FileCode } from 'lucide-react';

interface HumanGuidanceModalProps {
  finding: Finding | null;
  onClose: () => void;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Mark the placeholder rather than describing it. */
function renderWithTodo(code: string): React.ReactNode {
  const match = code.match(/TODO:[^"'>]*/);
  if (!match || match.index === undefined) return code;
  return (
    <>
      {code.slice(0, match.index)}
      <mark className="todo">{match[0]}</mark>
      {code.slice(match.index + match[0].length)}
    </>
  );
}

export const HumanGuidanceModal: React.FC<HumanGuidanceModalProps> = ({ finding, onClose }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const isOpen = finding !== null;

  useEffect(() => {
    if (!isOpen) return;

    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      restoreFocusTo.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!finding) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'color-mix(in srgb, var(--head) 55%, transparent)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guidance-modal-title"
        className="panel card-shadow w-full max-w-[620px] max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-line2">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-9 h-9 shrink-0 grid place-items-center bg-sunk border border-line2">
              <UserCheck className="w-4 h-4 text-cyellow" strokeWidth={1.5} />
            </span>
            <div className="min-w-0">
              <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.6px] text-cyellow">
                Action required · WCAG {finding.wcagCriterion} · {finding.category}
              </div>
              <h3 id="guidance-modal-title" className="text-[21px] font-bold text-head mt-0.5">
                This patch needs a person's words
              </h3>
              <span className="font-mono text-[11px] text-bodyp">{finding.findingId}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-bodyp hover:text-head transition-colors shrink-0"
          >
            <span className="sr-only">Close</span>
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {finding.patchedCode && (
            <div>
              <h4 className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.6px] text-bodyp mb-1.5">
                <FileCode className="w-3.5 h-3.5" strokeWidth={1.5} />
                Generated patch — placeholder present
              </h4>
              <pre className="code-surface border border-yellow p-3 text-[12.5px] text-head overflow-x-auto">
                <code>{renderWithTodo(finding.patchedCode)}</code>
              </pre>
            </div>
          )}

          <div>
            <h4 className="text-[10.5px] font-bold uppercase tracking-[0.6px] text-bodyp mb-1.5">
              Why the model stopped
            </h4>
            <p className="text-[13px] text-bodyp leading-relaxed">
              A11ySentinel never invents context or alt text when editorial intent is unknown. An
              explicit placeholder was inserted into the code patch for human review.
            </p>
          </div>

          <div>
            <h4 className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.6px] text-bodyp mb-1.5">
              <HelpCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
              What to supply
            </h4>
            <p
              className="text-[13px] text-head leading-relaxed border-l-2 border-yellow p-3"
              style={{ background: 'color-mix(in srgb, var(--yellow) 8%, var(--bg))' }}
            >
              {finding.humanGuidance}
            </p>
          </div>
        </div>

        <div className="flex justify-end p-5 border-t border-line2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-line2 text-[12.5px] font-semibold text-bodyp hover:text-head hover:bg-sunk transition-colors"
          >
            Close and return to findings
          </button>
        </div>
      </div>
    </div>
  );
};
