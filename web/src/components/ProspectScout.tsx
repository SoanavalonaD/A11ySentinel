import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Radar,
  ChevronsRight,
  Search,
  Check,
  AlertTriangle,
  Loader2,
  Play,
  Crosshair,
} from 'lucide-react';

export interface ScoutProspect {
  url: string;
  organisation: string;
  sector: string;
  country: string;
  context: string;
  /** Filled in by the `scanned` event. undefined means not checked yet. */
  violations?: number | null;
  skipped?: string | null;
}

interface ProspectScoutProps {
  /** Hand a discovered URL to the audit form. */
  onAudit: (url: string) => void;
  isAuditing: boolean;
}

type Phase = 'idle' | 'searching' | 'scanning' | 'done' | 'error';

/**
 * Agent 0, in the dashboard.
 *
 * Collapsed to a rail by default. Discovery costs a grounded search plus a
 * page load per candidate, so it does not run until someone opens it — an
 * agent that spends money every time a page loads is a bad neighbour, and the
 * panel would be occupying space to show an empty list anyway.
 *
 * Candidates stream in over SSE: the shortlist appears as soon as the search
 * returns, then each row fills in its violation count as it is checked. That
 * ordering is the honest one — a proposal is visibly a proposal until the rule
 * engine has been near it.
 */
export const ProspectScout: React.FC<ProspectScoutProps> = ({ onAudit, isAuditing }) => {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [prospects, setProspects] = useState<ScoutProspect[]>([]);
  const [queries, setQueries] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<{ url: string; reason: string } | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const stop = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  const scout = useCallback(() => {
    stop();
    setProspects([]);
    setQueries([]);
    setError(null);
    setPick(null);
    setPhase('searching');

    const es = new EventSource('/prospect/scout?count=8');
    sourceRef.current = es;

    es.addEventListener('search', (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setQueries(d.queries || []);
      if (d.reason) setError(d.reason);
      setPhase('scanning');
    });

    es.addEventListener('candidate', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as ScoutProspect;
      setProspects((prev) => (prev.some((p) => p.url === d.url) ? prev : [...prev, d]));
    });

    es.addEventListener('scanned', (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setProspects((prev) =>
        prev.map((p) =>
          p.url === d.url ? { ...p, violations: d.violations, skipped: d.skipped } : p,
        ),
      );
    });

    es.addEventListener('error', (e) => {
      const raw = (e as MessageEvent).data;
      if (raw) {
        try {
          setError(JSON.parse(raw).reason);
        } catch {
          setError('The scout stream failed.');
        }
      }
    });

    es.addEventListener('done', () => {
      setPhase('done');
      stop();
    });

    // A dropped connection surfaces as an error event with no data.
    es.onerror = () => {
      setPhase((p) => (p === 'done' ? p : 'error'));
      setError((prev) => prev ?? 'The scout stream closed unexpectedly.');
      stop();
    };
  }, [stop]);

  // Only spend on discovery once someone actually opens the panel.
  useEffect(() => {
    if (open && phase === 'idle') scout();
  }, [open, phase, scout]);

  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const checked = prospects.filter((p) => p.violations != null || p.skipped);
  const busy = phase === 'searching' || phase === 'scanning';

  // Candidates the rule engine has actually seen fail. A proposal with no
  // measured violations is not a target, and one still being checked is not
  // yet a fact.
  const auditable = prospects.filter((p) => typeof p.violations === 'number' && p.violations > 0);

  /**
   * Let the agent choose, rather than choosing for it.
   *
   * The criterion is `prospector.pick_target`'s: the candidate failing the
   * most people. Deliberately not random — "the agent picked at random" is a
   * weaker claim than "the agent scanned eight and chose the worst", and the
   * reason is shown so the decision can be checked rather than taken on faith.
   */
  const choose = () => {
    if (!auditable.length) return;
    const best = auditable.reduce((a, b) => ((b.violations ?? 0) > (a.violations ?? 0) ? b : a));
    setPick({
      url: best.url,
      reason:
        `${best.organisation} — highest violation count of the ` +
        `${checked.length} candidates checked (${best.violations} violations).`,
    });
    onAudit(best.url);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className="fixed right-0 top-1/3 z-[55] flex flex-col items-center gap-2 border border-r-0 border-line2 bg-panel px-2 py-4 text-bodyp hover:text-head hover:bg-sunk transition-colors card-shadow"
      >
        <Radar className="w-4 h-4 text-ccyan" strokeWidth={1.5} />
        <span
          className="text-[10.5px] font-bold uppercase tracking-[0.6px] whitespace-nowrap"
          style={{ writingMode: 'vertical-rl' }}
        >
          Prospect Scout
        </span>
        {prospects.length > 0 && (
          <span className="font-mono text-[10px] font-bold text-ccyan border border-cyan px-1">
            {prospects.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <aside
      ref={panelRef}
      aria-label="Prospect Scout"
      // Above the navbar's z-50. At z-40 the panel spanned from the top of
      // the viewport but its header — title and collapse control — rendered
      // underneath the sticky navbar, so the only way out of the panel was the
      // Escape key.
      className="fixed right-0 top-0 bottom-0 z-[60] w-full sm:w-[400px] bg-panel border-l border-line2 flex flex-col card-shadow"
    >
      <div className="flex items-start justify-between gap-3 p-4 border-b border-line2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.6px] text-ccyan">
            <Radar className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
            Agent 0 · ProspectScout
          </div>
          <h2 className="text-[17px] font-bold text-head mt-0.5">Sites worth a look</h2>
          <p className="text-[11.5px] text-bodyp mt-1">
            Found by grounded search, then checked with axe-core before they count.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-expanded={true}
          title="Collapse to the rail (Esc)"
          className="flex items-center gap-1.5 px-2.5 py-1.5 border border-line2 text-[11px] font-semibold text-bodyp hover:text-head hover:bg-sunk transition-colors shrink-0 whitespace-nowrap"
        >
          <ChevronsRight className="w-3.5 h-3.5" strokeWidth={1.5} />
          Collapse
        </button>
      </div>

      {/* What it actually searched for. Showing the queries is the difference
          between demonstrating that the agent searched and asserting it. */}
      {queries.length > 0 && (
        <details className="border-b border-line px-4 py-2 bg-sunk">
          <summary className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.6px] text-bodyp cursor-pointer">
            <Search className="w-3 h-3 shrink-0" strokeWidth={1.5} />
            {queries.length} searches run
          </summary>
          <ul className="mt-2 space-y-1 font-mono text-[10.5px] text-bodyp">
            {queries.map((q, i) => (
              <li key={i} className="break-words">
                {q.trim() || '(empty)'}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {busy && prospects.length === 0 && (
          <p className="flex items-center gap-2 text-[12.5px] text-bodyp">
            <Loader2 className="w-4 h-4 text-ccyan animate-spin shrink-0" strokeWidth={1.5} />
            Searching for candidates…
          </p>
        )}

        {prospects.map((p, i) => {
          const unchecked = p.violations == null && !p.skipped;
          const usable = typeof p.violations === 'number' && p.violations > 0;
          return (
            <article
              key={p.url}
              className="border border-line2 bg-sunk p-3 a11-rise"
              style={{ animationDelay: `${Math.min(i, 6) * 0.05}s` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-head break-words">
                    {p.organisation}
                  </div>
                  <div className="font-mono text-[11px] text-bodyp break-all">{p.url}</div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-cviolet border border-violet px-1.5 py-0.5 whitespace-nowrap shrink-0">
                  {p.sector}
                </span>
              </div>

              <p className="text-[11.5px] text-bodyp mt-2 leading-relaxed">{p.context}</p>

              <div className="flex items-center justify-between gap-2 mt-2.5">
                {unchecked ? (
                  <span className="flex items-center gap-1.5 font-mono text-[11px] text-bodyp">
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" strokeWidth={1.5} />
                    checking…
                  </span>
                ) : p.skipped ? (
                  <span className="flex items-center gap-1.5 font-mono text-[11px] text-cyellow">
                    <AlertTriangle className="w-3 h-3 shrink-0" strokeWidth={1.5} />
                    {p.skipped}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 font-mono text-[11px] text-cgreen">
                    <Check className="w-3 h-3 shrink-0" strokeWidth={2} />
                    {p.violations} violations
                  </span>
                )}

                <button
                  type="button"
                  disabled={!usable || isAuditing}
                  onClick={() => {
                    onAudit(p.url);
                    setOpen(false);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-fill-blue hover:bg-fill-blue-h text-on-fill text-[11px] font-semibold transition-colors disabled:opacity-[0.45] disabled:cursor-not-allowed disabled:hover:bg-fill-blue shrink-0"
                >
                  <Play className="w-3 h-3" strokeWidth={1.5} />
                  Audit this
                </button>
              </div>
            </article>
          );
        })}

        {error && (
          <p
            className="border border-yellow p-3 text-[12px] text-bodyp"
            style={{ background: 'color-mix(in srgb, var(--yellow) 10%, var(--bg))' }}
          >
            <strong className="text-cyellow font-semibold">Scout: </strong>
            {error}
          </p>
        )}

        {phase === 'done' && prospects.length === 0 && !error && (
          <p className="text-[12.5px] text-bodyp">
            The search returned nothing usable. That is a legitimate outcome, not an error.
          </p>
        )}
      </div>

      <div className="border-t border-line2 p-3 space-y-2.5">
        {/* The decision, kept on screen. The panel does not close itself —
            the audit is already running behind it, and the reasoning is the
            part worth reading. */}
        {pick && (
          <p
            className="border border-cyan p-2.5 text-[11.5px] text-bodyp"
            style={{ background: 'color-mix(in srgb, var(--cyan) 10%, var(--bg))' }}
            role="status"
          >
            <strong className="text-ccyan font-semibold">Agent 0 chose: </strong>
            {pick.reason}
          </p>
        )}

        <button
          type="button"
          onClick={choose}
          disabled={busy || !auditable.length || isAuditing}
          title={
            auditable.length
              ? 'Audit the candidate failing the most people'
              : 'No candidate has a measured violation count yet'
          }
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-fill-blue hover:bg-fill-blue-h text-on-fill text-[12px] font-bold transition-colors disabled:opacity-[0.45] disabled:cursor-not-allowed disabled:hover:bg-fill-blue"
        >
          <Crosshair className="w-3.5 h-3.5" strokeWidth={1.5} />
          Let the agent pick a target
        </button>

        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[10.5px] text-bodyp">
            {prospects.length > 0
              ? `${checked.length}/${prospects.length} checked · ${auditable.length} auditable`
              : busy
                ? 'working…'
                : 'idle'}
          </span>
          <button
            type="button"
            onClick={scout}
            disabled={busy}
            className="px-3 py-1.5 border border-line2 text-[11px] font-semibold text-bodyp hover:text-head hover:bg-sunk transition-colors disabled:opacity-[0.45] disabled:cursor-not-allowed"
          >
            {busy ? 'Scouting…' : 'Scout again'}
          </button>
        </div>
      </div>
    </aside>
  );
};
