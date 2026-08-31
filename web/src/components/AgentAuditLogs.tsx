import React, { useState } from 'react';
import { AgentAuditLogEntry, AgentName, LogLevel, AuditWriteReport } from '../types/schema';
import { Terminal, Search, Copy, Check, AlertTriangle, ShieldAlert, Globe } from 'lucide-react';

interface AgentAuditLogsProps {
  auditLogs?: AgentAuditLogEntry[];
  notes?: string[];
  write?: AuditWriteReport;
}

/**
 * How to read the timestamps. The pipeline stores UTC with a Z suffix and
 * always will — invariant 6, and the audit document uses the same clock. This
 * is purely display, so the reader picks.
 *
 * Defaults to the viewer's own zone, which is the answer that needs no
 * explaining wherever they happen to be.
 */
const ZONES: { id: string; label: string }[] = [
  { id: 'local', label: 'Local time' },
  { id: 'UTC', label: 'UTC' },
  { id: 'Indian/Antananarivo', label: 'Antananarivo (UTC+3)' },
  { id: 'Europe/Paris', label: 'Paris' },
  { id: 'America/New_York', label: 'New York' },
];

const ZONE_KEY = 'a11ysentinel-log-timezone';

/** HH:MM:SS in the chosen zone, from a stored UTC instant. */
function formatTime(iso: string, zone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(11, 19);
  try {
    return d.toLocaleTimeString('en-GB', {
      hour12: false,
      timeZone: zone === 'local' ? undefined : zone,
    });
  } catch {
    // An unknown zone id should not cost the reader the timestamp.
    return d.toLocaleTimeString('en-GB', { hour12: false });
  }
}

const AGENTS = [
  'All',
  'ProspectScout',
  'RootOrchestrator',
  'RuleAuditor',
  'VisualAuditor',
  'TriageAgent',
  'RemediationFanOut',
  'Remediator',
  'Verifier',
  'OutreachDrafter',
] as const;

/** Glyph + word for every level — the badge never rests on colour alone. */
const LEVEL: Record<LogLevel, { glyph: string; word: string; ink: string; accent: string }> = {
  info: { glyph: 'ⓘ', word: 'INFO', ink: 'text-cblue', accent: 'var(--blue)' },
  success: { glyph: '✓', word: 'SUCCESS', ink: 'text-cgreen', accent: 'var(--green)' },
  warn: { glyph: '▲', word: 'WARN', ink: 'text-cyellow', accent: 'var(--yellow)' },
  error: { glyph: '✕', word: 'ERROR', ink: 'text-cred', accent: 'var(--red)' },
};

export const AgentAuditLogs: React.FC<AgentAuditLogsProps> = ({
  auditLogs = [],
  notes = [],
  write,
}) => {
  const [selectedAgent, setSelectedAgent] = useState<AgentName | 'All'>('All');
  const [selectedLevel, setSelectedLevel] = useState<LogLevel | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [zone, setZone] = useState<string>(() => {
    try {
      return window.localStorage.getItem(ZONE_KEY) || 'local';
    } catch {
      return 'local';
    }
  });

  const filteredLogs = auditLogs.filter((log) => {
    if (selectedAgent !== 'All' && log.agentName !== selectedAgent) return false;
    if (selectedLevel !== 'All' && log.level !== selectedLevel) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const hit =
        log.message.toLowerCase().includes(q) ||
        log.agentName.toLowerCase().includes(q) ||
        (log.details?.toLowerCase().includes(q) ?? false);
      if (!hit) return false;
    }
    return true;
  });

  const handleCopyLogs = () => {
    const text = filteredLogs
      .map(
        (l) =>
          `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.agentName}] ${l.message}${
            l.details ? ` (${l.details})` : ''
          }`
      )
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const rejections = write?.findingsRejected ?? [];

  const pickZone = (next: string) => {
    setZone(next);
    try {
      window.localStorage.setItem(ZONE_KEY, next);
    } catch {
      // A remembered preference is a convenience, not a requirement.
    }
  };

  const zoneLabel =
    zone === 'local'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'
      : zone;

  return (
    <section className="panel card-shadow" aria-label="Agent audit logs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 p-5 border-b border-line2">
        <div>
          <h3 className="flex items-center gap-2 text-[21px] font-bold text-head">
            <Terminal className="w-5 h-5 text-ccyan shrink-0" strokeWidth={1.5} />
            Agent Audit Logs &amp; Pipeline Decision Trail
          </h3>
          <p className="text-[12.5px] text-bodyp mt-1 max-w-3xl">
            Surfacing real-time agent decisions, Gemini multimodal discards (
            <code className="font-mono text-cblue">service.py payload["notes"]</code>), and Verifier
            write-gate rejections.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCopyLogs}
          className="flex items-center gap-2 px-3 py-2 border border-line2 text-[11px] font-semibold text-bodyp hover:text-head hover:bg-sunk transition-colors shrink-0 whitespace-nowrap"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-cgreen" strokeWidth={1.5} />
          ) : (
            <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
          {copied ? 'Copied to clipboard' : 'Copy log'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 p-4 bg-sunk border-b border-line">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.6px] text-bodyp mr-1">
            Agent:
          </span>
          {AGENTS.map((agent) => {
            const active = selectedAgent === agent;
            return (
              <button
                key={agent}
                type="button"
                onClick={() => setSelectedAgent(agent)}
                aria-pressed={active}
                className={`px-2.5 py-1 text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-fill-blue text-on-fill border-fill-blue'
                    : 'bg-transparent text-bodyp border-line2 hover:text-head'
                }`}
              >
                {agent === 'All' ? 'All (8)' : agent}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative flex-grow xl:flex-grow-0">
            <label htmlFor="log-search" className="sr-only">
              Search logs
            </label>
            <input
              id="log-search"
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full xl:w-44 bg-bg border border-line2 pl-8 pr-3 py-1.5 text-[12px] text-head"
            />
            <Search
              className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-bodyp pointer-events-none"
              strokeWidth={1.5}
            />
          </div>

          <label htmlFor="log-timezone" className="sr-only">
            Timestamp timezone
          </label>
          <div className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-bodyp shrink-0" strokeWidth={1.5} />
            <select
              id="log-timezone"
              value={zone}
              onChange={(e) => pickZone(e.target.value)}
              title={`Timestamps are stored in UTC and shown in ${zoneLabel}`}
              className="bg-bg border border-line2 px-2.5 py-1.5 text-[12px] text-head"
            >
              {ZONES.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>
          </div>

          <label htmlFor="log-level" className="sr-only">
            Filter by log level
          </label>
          <select
            id="log-level"
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value as LogLevel | 'All')}
            className="bg-bg border border-line2 px-2.5 py-1.5 text-[12px] text-head"
          >
            <option value="All">Level: All</option>
            <option value="info">ⓘ INFO</option>
            <option value="success">✓ SUCCESS</option>
            <option value="warn">▲ WARN</option>
            <option value="error">✕ ERROR</option>
          </select>
        </div>
      </div>

      {/* Stream */}
      <div className="code-surface max-h-[420px] overflow-y-auto">
        {filteredLogs.length === 0 ? (
          <p className="p-8 text-center text-[12.5px] text-bodyp font-sans">
            No agent audit logs match your filter criteria.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {filteredLogs.map((log) => {
              const level = LEVEL[log.level];
              return (
                <li
                  key={log.logId}
                  className="grid grid-cols-1 md:grid-cols-[74px_150px_86px_1fr] gap-x-3 gap-y-1.5 px-4 py-2.5 items-start"
                >
                  <span
                    className="font-mono text-[11px] text-bodyp whitespace-nowrap"
                    title={`${log.timestamp} (stored UTC)`}
                  >
                    {formatTime(log.timestamp, zone)}
                  </span>

                  <span className="font-mono text-[11px] font-bold text-head border border-line2 px-1.5 py-0.5 justify-self-start truncate max-w-full">
                    {log.agentName}
                  </span>

                  <span
                    className={`font-mono text-[10px] font-bold px-1.5 py-0.5 border justify-self-start whitespace-nowrap ${level.ink}`}
                    style={{ borderColor: `color-mix(in srgb, ${level.accent} 55%, transparent)` }}
                  >
                    <span aria-hidden="true">{level.glyph}</span> {level.word}
                  </span>

                  <span className="min-w-0">
                    <span className="block font-sans text-[12.5px] text-head leading-relaxed">
                      {log.message}
                    </span>
                    {log.details && (
                      <span className="block font-mono text-[11px] text-bodyp mt-0.5 break-words">
                        {log.details}
                      </span>
                    )}
                    {log.stage && (
                      <span className="block font-mono text-[10px] text-bodyp mt-0.5">
                        [{log.stage}]
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-line font-mono text-[11px] text-bodyp">
          <span aria-hidden="true" className="a11-blink text-ccyan font-bold">
            ▍
          </span>
          stream idle · awaiting next pipeline event
        </div>
      </div>

      {/* Discards and write-gate rejections */}
      {(notes.length > 0 || rejections.length > 0) && (
        <div className="p-4 space-y-2 border-t border-line2">
          {notes.length > 0 && (
            <details className="border border-line2">
              <summary className="flex items-center gap-2 px-3 py-2 text-[12.5px] font-bold text-cyellow cursor-pointer bg-sunk">
                <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                Agent Discards &amp; Notes ({notes.length})
              </summary>
              <ul className="p-3 space-y-1.5 font-mono text-[11px] text-bodyp">
                {notes.map((note, idx) => (
                  <li key={idx} className="break-words">
                    <span aria-hidden="true" className="text-bodyp">
                      ·{' '}
                    </span>
                    {note}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {rejections.length > 0 && (
            <details className="border border-line2">
              <summary className="flex items-center gap-2 px-3 py-2 text-[12.5px] font-bold text-cred cursor-pointer bg-sunk">
                <ShieldAlert className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                Verifier Write-Gate Rejections ({rejections.length})
              </summary>
              <ul className="p-3 space-y-1.5 font-mono text-[11px] text-bodyp">
                {rejections.map((rej, idx) => (
                  <li key={idx} className="break-words">
                    <span className="text-cred font-bold">[{rej.findingId}]</span> {rej.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
};
