import React from 'react';
import { FindingSeverity, FindingSource, FindingStatus } from '../types/schema';
import { Filter, CheckCircle, AlertTriangle, Eye, Shield, Search } from 'lucide-react';

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
  return (
    <div className="glass-panel rounded-2xl p-4 mb-6 border border-slate-800 space-y-4">
      
      {/* Top row: Tab pills */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        
        {/* Status Tabs */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => onTabChange('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center space-x-2 ${
              activeTab === 'all'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <span>All Findings</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-900/60 font-mono">
              {totalCount}
            </span>
          </button>

          <button
            onClick={() => onTabChange('verified')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center space-x-2 ${
              activeTab === 'verified'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <CheckCircle className="w-3.5 h-3.5 text-emerald-300" />
            <span>Verified Fixes</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-950/60 text-emerald-300 font-mono">
              {verifiedCount}
            </span>
          </button>

          <button
            onClick={() => onTabChange('detected')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center space-x-2 ${
              activeTab === 'detected'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-rose-300" />
            <span>Detected Violations (No Diff)</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-rose-950/60 text-rose-300 font-mono">
              {detectedCount}
            </span>
          </button>

          <button
            onClick={() => onTabChange('human_action')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center space-x-2 ${
              activeTab === 'human_action'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
            <span>Action Required</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-950/60 text-amber-300 font-mono">
              {humanCount}
            </span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter by rule, selector..."
            className="w-full glass-input rounded-xl px-3 py-1.5 pl-9 text-xs text-white placeholder-slate-500 focus:outline-none"
          />
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
        </div>

      </div>

      {/* Bottom row: Dropdowns for Severity and Source */}
      <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-800/80 text-xs">
        <div className="flex items-center space-x-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400 font-medium">Severity:</span>
          <select
            value={severityFilter}
            onChange={(e) => onSeverityChange(e.target.value as FindingSeverity | 'all')}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="serious">Serious</option>
            <option value="moderate">Moderate</option>
            <option value="minor">Minor</option>
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-slate-400 font-medium">Source:</span>
          <select
            value={sourceFilter}
            onChange={(e) => onSourceChange(e.target.value as FindingSource | 'all')}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none"
          >
            <option value="all">All Sources</option>
            <option value="axe">axe-core (Deterministic Rules)</option>
            <option value="visual">VisualAuditor (Gemini Multimodal)</option>
          </select>
        </div>
      </div>

    </div>
  );
};
