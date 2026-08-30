import React, { useState } from 'react';
import { Finding, FindingSeverity } from '../types/schema';
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
} from 'lucide-react';

interface FindingCardProps {
  finding: Finding;
  index: number;
  onOpenHumanGuidance: (finding: Finding) => void;
}

/** Glyph + word for every severity — the label never rests on colour alone. */
const SEVERITY: Record<FindingSeverity, { glyph: string; ink: string; border: string }> = {
  critical: { glyph: '■', ink: 'text-cred', border: 'border-red' },
  serious: { glyph: '◆', ink: 'text-corange', border: 'border-orange' },
  moderate: { glyph: '▲', ink: 'text-cyellow', border: 'border-yellow' },
  minor: { glyph: '●', ink: 'text-cblue', border: 'border-blue' },
};

/** Split a draft patch so the TODO placeholder can be marked rather than described. */
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

const Chip: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <span
    className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold border ${className}`}
  >
    {children}
  </span>
);

export const FindingCard: React.FC<FindingCardProps> = ({
  finding,
  index,
  onOpenHumanGuidance,
}) => {
  const [copiedSelector, setCopiedSelector] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  // Hard rule: a `patched` finding is never rendered.
  if (finding.status === 'patched') return null;

  const isVerified = finding.status === 'verified';
  const needsHuman = finding.requiresHumanInput;

  const copySelector = () => {
    navigator.clipboard.writeText(finding.selector);
    setCopiedSelector(true);
    setTimeout(() => setCopiedSelector(false), 2000);
  };

  // State drives one full-width band at the top of the card — no left rails.
  const band = needsHuman
    ? { accent: 'var(--yellow)', ink: 'text-cyellow', Icon: UserCheck, label: 'Action Required — human input' }
    : isVerified
    ? { accent: 'var(--green)', ink: 'text-cgreen', Icon: CheckCircle, label: 'Verified Patch' }
    : { accent: 'var(--red)', ink: 'text-cred', Icon: ShieldAlert, label: 'Detected Violation — no patch' };

  const severity = SEVERITY[finding.severity];
  const stagger = [0.04, 0.11, 0.18][index % 3];

  return (
    <article
      className="panel card-shadow card-shadow-hover a11-rise transition-shadow duration-[180ms] ease-out"
      style={{
        animationDelay: `${stagger}s`,
        background: needsHuman
          ? 'color-mix(in srgb, var(--yellow) 5%, var(--bg))'
          : undefined,
      }}
    >
      {/* Status band */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b"
        style={{
          background: `color-mix(in srgb, ${band.accent} 16%, var(--panel))`,
          borderBottomColor: `color-mix(in srgb, ${band.accent} 45%, transparent)`,
        }}
      >
        <span className={`flex items-center gap-2 text-[13px] font-bold ${band.ink}`}>
          <band.Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
          {band.label}
        </span>

        {/* On the tinted band, body ink drops to ~3.8:1 — the band's own
            --c* ramp is the accessible ink here. */}
        <span className={`flex items-center gap-2 shrink-0 ${band.ink}`}>
          <span className="text-[10px] font-bold uppercase tracking-[0.6px]">Finding</span>
          <span className="font-display text-[15px] font-bold text-on-plate bg-plate px-2 py-0.5 leading-tight">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="font-mono text-[11px]">{finding.findingId}</span>
        </span>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-line">
        <div className="flex flex-wrap items-center gap-2">
          <Chip className={finding.source === 'visual' ? 'border-violet text-cviolet' : 'border-line2 text-bodyp'}>
            {finding.source === 'visual' ? (
              <Eye className="w-3 h-3" strokeWidth={1.5} />
            ) : (
              <Code className="w-3 h-3" strokeWidth={1.5} />
            )}
            {finding.source === 'visual' ? 'VisualAuditor (Gemini)' : 'axe-core'}
          </Chip>

          <Chip className={`${severity.border} ${severity.ink} uppercase tracking-[0.5px]`}>
            <span aria-hidden="true">{severity.glyph}</span>
            {finding.severity}
          </Chip>

          <Chip className="border-line2 text-head font-mono">{finding.category}</Chip>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="px-2 py-0.5 border border-line2 text-cblue font-semibold">
            WCAG {finding.wcagCriterion}
          </span>
          {finding.regionalFramework && finding.regionalCriterion && (
            <span
              className="px-2 py-0.5 border border-line2 text-ccyan font-semibold"
              title="Regional framework equivalent (contextual reference)"
            >
              {finding.regionalFramework} {finding.regionalCriterion}
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            className="p-1 text-bodyp hover:text-head transition-colors"
          >
            <span className="sr-only">{isExpanded ? 'Collapse finding' : 'Expand finding'}</span>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" strokeWidth={1.5} />
            ) : (
              <ChevronDown className="w-4 h-4" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4">
          <div>
            <h4 className="text-[10.5px] font-bold uppercase tracking-[0.6px] text-bodyp mb-1.5">
              User Impact (Plain-Language Consequence):
            </h4>
            <p className="text-[14px] text-head leading-relaxed bg-sunk border border-line p-3">
              {finding.userImpact}
            </p>
          </div>

          {finding.evidence && (
            <div className="border border-violet p-3 text-[12.5px] text-bodyp" style={{ background: 'color-mix(in srgb, var(--violet) 8%, var(--bg))' }}>
              <span className="font-semibold text-cviolet flex items-center gap-1.5 mb-1">
                <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                Multimodal Visual Finding:
              </span>
              {finding.evidence}
            </div>
          )}

          {/* Screen reader announcement — rendered only when both sides exist. */}
          {finding.announcedBefore !== null && finding.announcedAfter !== null && (
            <div
              className="border border-cyan p-3.5"
              style={{ background: 'color-mix(in srgb, var(--cyan) 10%, var(--bg))' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Volume2 className="w-4 h-4 text-ccyan shrink-0" strokeWidth={1.5} />
                <span className="text-[12.5px] font-bold text-ccyan">
                  Screen Reader Announcement (Chromium CDP)
                </span>
                <span aria-hidden="true" className="flex items-end gap-[3px] h-3.5 ml-1">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="w-[3px] h-full bg-cyan a11-eq"
                      style={{ animationDelay: `${i * 0.18}s` }}
                    />
                  ))}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-[13px]">
                <div className="bg-sunk border border-red p-2.5">
                  <span className="block font-sans text-[10px] font-bold uppercase tracking-[0.6px] text-cred mb-1">
                    Before Patch:
                  </span>
                  <span className="text-head break-words">{finding.announcedBefore}</span>
                </div>
                <div className="bg-sunk border border-green p-2.5">
                  <span className="block font-sans text-[10px] font-bold uppercase tracking-[0.6px] text-cgreen mb-1">
                    After Patch:
                  </span>
                  <span className="text-head break-words">{finding.announcedAfter}</span>
                </div>
              </div>
            </div>
          )}

          {/* Selector */}
          <div>
            <div className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.6px] text-bodyp mb-1.5">
              <span>CSS Selector:</span>
              <button
                type="button"
                onClick={copySelector}
                className="flex items-center gap-1.5 text-bodyp hover:text-head transition-colors normal-case tracking-normal font-semibold text-[11px]"
              >
                {copiedSelector ? (
                  <Check className="w-3.5 h-3.5 text-cgreen" strokeWidth={1.5} />
                ) : (
                  <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                )}
                {copiedSelector ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="code-surface border border-line2 p-2.5 text-[12.5px] text-head overflow-x-auto">
              {finding.selector}
            </div>
          </div>

          {/* Diff — verified fixes and draft patches awaiting a person. */}
          {finding.patchedCode && (isVerified || needsHuman) ? (
            <div>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-1.5">
                <h5 className="text-[10.5px] font-bold uppercase tracking-[0.6px] text-bodyp flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5" strokeWidth={1.5} />
                  {needsHuman ? 'Draft Source Code Diff:' : 'Verified Source Code Diff:'}
                </h5>
                {finding.changeSummary && (
                  <span className="text-[12px] text-cgreen italic">"{finding.changeSummary}"</span>
                )}
              </div>

              <div className="border border-line2 font-mono text-[12.5px]">
                <div className="diff-removed p-3 overflow-x-auto">
                  <span className="block font-sans text-[10px] font-bold uppercase tracking-[0.6px] mb-1">
                    − Original
                  </span>
                  <code className="text-head">{finding.currentCode}</code>
                </div>
                <div className="diff-added p-3 overflow-x-auto">
                  <span className="block font-sans text-[10px] font-bold uppercase tracking-[0.6px] mb-1">
                    {needsHuman ? '+ Draft patch — contains placeholder' : '+ Verified Patch'}
                  </span>
                  <code className="text-head">
                    {needsHuman ? renderWithTodo(finding.patchedCode) : finding.patchedCode}
                  </code>
                </div>
              </div>
            </div>
          ) : null}

          {/* No patch on this finding. */}
          {!finding.patchedCode && (
            <div className="border border-dashed border-red p-4 text-[12.5px] text-bodyp flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-cred shrink-0 mt-0.5" strokeWidth={1.5} />
              <span>
                <strong className="text-cred font-semibold">No patch on this finding. </strong>
                Real violation confirmed by axe-core. No code patch has survived verification yet.
              </span>
            </div>
          )}

          {/* Human review block. */}
          {needsHuman && (
            <div
              className="border border-yellow p-4 space-y-3"
              style={{ background: 'color-mix(in srgb, var(--yellow) 10%, var(--bg))' }}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="flex items-center gap-2 text-[12.5px] font-bold text-cyellow">
                  <AlertTriangle className="w-4 h-4" strokeWidth={1.5} />
                  Requires human review
                </span>
                <button
                  type="button"
                  onClick={() => onOpenHumanGuidance(finding)}
                  className="px-3 py-1.5 bg-fill-yellow hover:bg-fill-yellow-h text-on-fill text-[11px] font-semibold transition-colors"
                >
                  View editing guidance
                </button>
              </div>
              <p className="text-[12.5px] text-bodyp leading-relaxed">{finding.humanGuidance}</p>
            </div>
          )}
        </div>
      )}
    </article>
  );
};
