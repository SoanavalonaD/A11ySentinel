import React, { useState } from 'react';
import { AgentAuditLogEntry, AgentName, LogLevel, AuditWriteReport } from '../types/schema';
import { 
  Terminal, 
  Search, 
  Copy, 
  Check, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  CheckCircle, 
  Cpu, 
  Filter, 
  ShieldAlert, 
  ChevronDown, 
  ChevronRight,
  Layers
} from 'lucide-react';

interface AgentAuditLogsProps {
  auditLogs?: AgentAuditLogEntry[];
  notes?: string[];
  write?: AuditWriteReport;
}

export const AgentAuditLogs: React.FC<AgentAuditLogsProps> = ({
  auditLogs = [],
  notes = [],
  write,
}) => {
  const [selectedAgent, setSelectedAgent] = useState<AgentName | 'All'>('All');
  const [selectedLevel, setSelectedLevel] = useState<LogLevel | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  const toggleExpand = (logId: string) => {
    setExpandedLogs((prev) => ({ ...prev, [logId]: !prev[logId] }));
  };

  // Combine auditLogs with notes & findingsRejected if provided
  const combinedLogs: AgentAuditLogEntry[] = [...auditLogs];

  // Filter logs
  const filteredLogs = combinedLogs.filter((log) => {
    if (selectedAgent !== 'All' && log.agentName !== selectedAgent) return false;
    if (selectedLevel !== 'All' && log.level !== selectedLevel) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchMsg = log.message.toLowerCase().includes(q);
      const matchAgent = log.agentName.toLowerCase().includes(q);
      const matchDetails = log.details?.toLowerCase().includes(q) || false;
      if (!matchMsg && !matchAgent && !matchDetails) return false;
    }
    return true;
  });

  const handleCopyLogs = () => {
    const textToCopy = filteredLogs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.agentName}] ${l.message}${l.details ? ` (${l.details})` : ''}`)
      .join('\n');
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLevelBadge = (level: LogLevel) => {
    switch (level) {
      case 'success':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle className="w-3 h-3" />
            <span>SUCCESS</span>
          </span>
        );
      case 'warn':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3" />
            <span>WARN</span>
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-3 h-3" />
            <span>ERROR</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Info className="w-3 h-3" />
            <span>INFO</span>
          </span>
        );
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-6 border border-slate-800 shadow-xl space-y-6">
      
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Terminal className="w-5 h-5 text-indigo-400" />
            <h3 className="text-lg font-bold text-white tracking-tight">
              Agent Audit Logs & Pipeline Decision Trail
            </h3>
            <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
              7 ADK Agents
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Surfacing real-time agent decisions, Gemini multimodal discards (<code className="text-indigo-300 font-mono">service.py payload["notes"]</code>), and Verifier write-gate rejections.
          </p>
        </div>

        <button
          onClick={handleCopyLogs}
          className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-semibold transition shrink-0"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-indigo-400" />}
          <span>{copied ? 'Copied to Clipboard!' : 'Copy Audit Trail'}</span>
        </button>
      </div>

      {/* Discards & Write-Gate Summary Banners */}
      {(notes.length > 0 || (write?.findingsRejected && write.findingsRejected.length > 0)) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          
          {/* Notes / Discards Banner */}
          {notes.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-2">
              <div className="flex items-center space-x-2 font-bold text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Agent Discards & Notes ({notes.length})</span>
              </div>
              <ul className="space-y-1 text-slate-300 list-disc list-inside font-mono text-[11px]">
                {notes.map((note, idx) => (
                  <li key={idx} className="truncate">{note}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Write-Gate Rejections Banner */}
          {write?.findingsRejected && write.findingsRejected.length > 0 && (
            <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-2">
              <div className="flex items-center space-x-2 font-bold text-rose-300">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Verifier Write-Gate Rejections ({write.findingsRejected.length})</span>
              </div>
              <ul className="space-y-1 text-slate-300 font-mono text-[11px]">
                {write.findingsRejected.map((rej, idx) => (
                  <li key={idx} className="flex justify-between">
                    <span className="text-rose-400 font-bold">[{rej.findingId}]</span>
                    <span className="text-slate-400 truncate max-w-xs">{rej.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      )}

      {/* Filter Controls Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        
        {/* Agent Filter Tabs */}
        <div className="flex items-center space-x-1.5 overflow-x-auto max-w-full pb-1 md:pb-0">
          <span className="text-slate-500 font-semibold text-[11px] shrink-0 mr-1">Agent:</span>
          {(['All', 'RootOrchestrator', 'RuleAuditor', 'VisualAuditor', 'TriageAgent', 'RemediationFanOut', 'Remediator', 'Verifier'] as const).map((agent) => (
            <button
              key={agent}
              onClick={() => setSelectedAgent(agent)}
              className={`px-2.5 py-1 rounded-lg font-medium transition text-[11px] shrink-0 ${
                selectedAgent === agent
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {agent === 'All' ? 'All (7)' : agent}
            </button>
          ))}
        </div>

        {/* Search & Level Filter */}
        <div className="flex items-center space-x-2 w-full md:w-auto shrink-0">
          <div className="relative flex-grow md:flex-grow-0">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input pl-9 pr-3 py-1.5 text-xs text-white rounded-lg w-full md:w-44"
            />
          </div>

          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value as any)}
            className="glass-input px-3 py-1.5 text-xs text-white rounded-lg bg-slate-900 border border-slate-800"
          >
            <option value="All">Level: All</option>
            <option value="info">INFO</option>
            <option value="success">SUCCESS</option>
            <option value="warn">WARN</option>
            <option value="error">ERROR</option>
          </select>
        </div>

      </div>

      {/* Log Console Output List */}
      <div className="rounded-2xl border border-slate-800 overflow-hidden bg-[#060911] font-mono text-xs shadow-inner">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No agent audit logs match your filter criteria.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60 max-h-96 overflow-y-auto">
            {filteredLogs.map((log) => {
              const isExpanded = expandedLogs[log.logId];
              return (
                <div key={log.logId} className="p-3 hover:bg-slate-900/50 transition space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
                      <span className="text-[10px] text-slate-500 shrink-0">{log.timestamp}</span>
                      {getLevelBadge(log.level)}
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-bold text-[11px] shrink-0 border border-slate-700">
                        {log.agentName}
                      </span>
                      {log.stage && (
                        <span className="text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">
                          [{log.stage}]
                        </span>
                      )}
                    </div>

                    {log.details && (
                      <button
                        onClick={() => toggleExpand(log.logId)}
                        className="text-slate-500 hover:text-slate-300 transition text-[10px] flex items-center space-x-1 shrink-0"
                      >
                        <span>{isExpanded ? 'Hide Details' : 'Details'}</span>
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </button>
                    )}
                  </div>

                  <p className="text-slate-200 leading-relaxed text-[11px] font-sans pl-1">
                    {log.message}
                  </p>

                  {log.details && isExpanded && (
                    <div className="p-2.5 rounded bg-slate-950 text-indigo-300 text-[11px] border border-slate-800/80 mt-1">
                      <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold mb-0.5">Details:</span>
                      <code>{log.details}</code>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
