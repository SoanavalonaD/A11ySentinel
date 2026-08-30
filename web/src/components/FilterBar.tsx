import React from 'react';
import { FindingSeverity, FindingSource } from '../types/schema';
import { Filter, CheckCircle, AlertTriangle, Shield, Search, Layers } from 'lucide-react';

export type StatusTab = 'all' | 'verified' | 'detected' | 'human_action';

interface FilterBarProps {
  activeTab: StatusTab;
  onTabChange: (tab: StatusTab) => void;
  severityFilter: FindingSeverity | 'all';
  onSeverityChange: (severity: FindingSeverity | 'all') => void;
  sourceFilter: FindingSource | 'all';
  onSourceChange: (source: FindingSource | 'all') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  totalCount: number;
  verifiedCount: number;
  detectedCount: number;
  humanCount: number;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  activeTab,
  onTabChange,
  severityFilter,
  onSeverityChange,
  sourceFilter,
  onSourceChange,
  searchQuery,
  onSearchChange,
  totalCount,
  verifiedCount,
  detectedCount,
  humanCount,
}) => {
  const tabs: { id: StatusTab; label: string; count: number; Icon: typeof Layers }[] = [
    { id: 'all', label: 'All Findings', count: totalCount, Icon: Layers },
    { id: 'verified', label: 'Verified Fixes', count: verifiedCount, Icon: CheckCircle },
    { id: 'detected', label: 'Detected Violations (No Diff)', count: detectedCount, Icon: Shield },
    { id: 'human_action', label: 'Action Required', count: humanCount, Icon: AlertTriangle },
  ];

  const selectClass =
    'bg-sunk border border-line2 px-2.5 py-1.5 text-[12px] text-head';

  return (
    <section className="panel card-shadow p-4 space-y-4" aria-label="Filter findings">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap" role="tablist" aria-label="Finding status">
          {tabs.map(({ id, label, count, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(id)}
                className={`flex items-center gap-2 px-3 py-2 text-[12px] font-semibold border transition-colors ${
                  active
                    ? 'bg-fill-blue text-on-fill border-fill-blue'
                    : 'bg-transparent text-bodyp border-line2 hover:text-head'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                <span className="whitespace-nowrap">{label}</span>
                <span
                  className={`font-mono text-[11px] font-bold px-1.5 border ${
                    active ? 'border-on-fill/40' : 'border-line2'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-64 shrink-0">
          <label htmlFor="finding-search" className="sr-only">
            Filter findings by rule or selector
          </label>
          <input
            id="finding-search"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter by rule, selector..."
            className="w-full bg-sunk border border-line2 px-3 py-2 pl-9 text-[12px] text-head"
          />
          <Search
            className="w-3.5 h-3.5 text-bodyp absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            strokeWidth={1.5}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-3 border-t border-line">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-bodyp" strokeWidth={1.5} />
          <label
            htmlFor="severity-filter"
            className="text-[10.5px] font-bold uppercase tracking-[0.6px] text-bodyp"
          >
            Severity:
          </label>
          <select
            id="severity-filter"
            value={severityFilter}
            onChange={(e) => onSeverityChange(e.target.value as FindingSeverity | 'all')}
            className={selectClass}
          >
            <option value="all">All Severities</option>
            <option value="critical">■ Critical</option>
            <option value="serious">◆ Serious</option>
            <option value="moderate">▲ Moderate</option>
            <option value="minor">● Minor</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="source-filter"
            className="text-[10.5px] font-bold uppercase tracking-[0.6px] text-bodyp"
          >
            Source:
          </label>
          <select
            id="source-filter"
            value={sourceFilter}
            onChange={(e) => onSourceChange(e.target.value as FindingSource | 'all')}
            className={selectClass}
          >
            <option value="all">All Sources</option>
            <option value="axe">axe-core (Deterministic Rules)</option>
            <option value="visual">VisualAuditor (Gemini Multimodal)</option>
          </select>
        </div>
      </div>
    </section>
  );
};
