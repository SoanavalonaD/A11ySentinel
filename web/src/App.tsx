import React, { useState } from 'react';
import { Audit, Finding, FindingSeverity, FindingSource } from './types/schema';
import { SAMPLE_FIXTURE, DEMO_SITE_FIXTURE } from './data/sampleFixture';
import { runAuditApi, AuditRequestPayload } from './services/api';

import { Navbar } from './components/Navbar';
import { AuditForm } from './components/AuditForm';
import { AuditSummary } from './components/AuditSummary';
import { FilterBar, StatusTab } from './components/FilterBar';
import { FindingCard } from './components/FindingCard';
import { LiveProgressTracker } from './components/LiveProgressTracker';
import { HumanGuidanceModal } from './components/HumanGuidanceModal';
import { RemediationReport } from './components/RemediationReport';

import { ShieldCheck, Layers, AlertCircle, FileCheck2, Code2 } from 'lucide-react';

export const App: React.FC = () => {
  const [activeAudit, setActiveAudit] = useState<Audit>(SAMPLE_FIXTURE.audit);
  const [findings, setFindings] = useState<Finding[]>(SAMPLE_FIXTURE.findings);
  const [activeFixtureName, setActiveFixtureName] = useState<'sample' | 'demo' | 'custom'>('sample');

  const [isLoading, setIsLoading] = useState(false);
  const [selectedHumanFinding, setSelectedHumanFinding] = useState<Finding | null>(null);

  // View mode: 'dashboard' | 'report'
  const [viewMode, setViewMode] = useState<'dashboard' | 'report'>('dashboard');

  // Filters state
  const [activeTab, setActiveTab] = useState<StatusTab>('all');
  const [severityFilter, setSeverityFilter] = useState<FindingSeverity | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<FindingSource | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Handle Preset Load
  const handleLoadFixture = (fixtureName: 'sample' | 'demo') => {
    setActiveFixtureName(fixtureName);
    if (fixtureName === 'sample') {
      setActiveAudit(SAMPLE_FIXTURE.audit);
      setFindings(SAMPLE_FIXTURE.findings);
    } else {
      setActiveAudit(DEMO_SITE_FIXTURE.audit);
      setFindings(DEMO_SITE_FIXTURE.findings);
    }
  };

  // Handle Audit Submission
  const handleRunAudit = async (payload: AuditRequestPayload) => {
    setIsLoading(true);

    // Initial audit state
    const newAudit: Audit = {
      auditId: `aud_${Math.random().toString(16).substring(2, 8)}`,
      targetUrl: payload.url,
      trigger: 'manual',
      status: 'queued',
      createdAt: new Date().toISOString(),
      completedAt: null,
      pageCount: 3,
      violationsBefore: 0,
      violationsAfter: null,
      proxyUrl: null,
      emailStatus: 'draft',
      error: null
    };

    setActiveAudit(newAudit);
    setActiveFixtureName('custom');

    // Simulate progress stages for better UX
    setTimeout(() => {
      setActiveAudit(prev => ({ ...prev, status: 'capturing' }));
    }, 600);

    setTimeout(() => {
      setActiveAudit(prev => ({ ...prev, status: 'auditing' }));
    }, 1400);

    setTimeout(() => {
      setActiveAudit(prev => ({ ...prev, status: 'remediating' }));
    }, 2200);

    setTimeout(() => {
      setActiveAudit(prev => ({ ...prev, status: 'verifying' }));
    }, 3000);

    // Complete audit execution
    try {
      const result = await runAuditApi(payload);
      setTimeout(() => {
        setActiveAudit({
          ...result.audit,
          status: 'complete'
        });
        setFindings(result.findings);
        setIsLoading(false);
      }, 3800);
    } catch (err) {
      console.error('Audit execution error:', err);
      setIsLoading(false);
    }
  };

  // Counts calculations
  const totalCount = findings.length;
  const verifiedCount = findings.filter(f => f.status === 'verified').length;
  const detectedCount = findings.filter(f => f.status === 'detected').length;
  const humanCount = findings.filter(f => f.requiresHumanInput).length;

  // Filtered findings list
  const filteredFindings = findings.filter((finding) => {
    // Hard rule: 'patched' status findings are never rendered
    if (finding.status === 'patched') return false;

    // Tab filter
    if (activeTab === 'verified' && finding.status !== 'verified') return false;
    if (activeTab === 'detected' && finding.status !== 'detected') return false;
    if (activeTab === 'human_action' && !finding.requiresHumanInput) return false;

    // Severity filter
    if (severityFilter !== 'all' && finding.severity !== severityFilter) return false;

    // Source filter
    if (sourceFilter !== 'all' && finding.source !== sourceFilter) return false;

    // Search query filter
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchCategory = finding.category.toLowerCase().includes(q);
      const matchSelector = finding.selector.toLowerCase().includes(q);
      const matchImpact = finding.userImpact.toLowerCase().includes(q);
      const matchWcag = finding.wcagCriterion.includes(q);
      if (!matchCategory && !matchSelector && !matchImpact && !matchWcag) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="min-h-screen flex flex-col font-sans">
      
      {/* Navbar */}
      <Navbar
        onLoadFixture={handleLoadFixture}
        activeFixture={activeFixtureName}
        onOpenReport={() => setViewMode(viewMode === 'report' ? 'dashboard' : 'report')}
        isReportMode={viewMode === 'report'}
      />

      {viewMode === 'report' ? (
        <RemediationReport
          audit={activeAudit}
          findings={findings}
          onBackToDashboard={() => setViewMode('dashboard')}
        />
      ) : (
        /* Main Container */
        <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          
          {/* Audit Form */}
          <AuditForm onRunAudit={handleRunAudit} isLoading={isLoading} />

          {/* Live Progress Tracker (during loading or active stage) */}
          {isLoading && (
            <LiveProgressTracker status={activeAudit.status} pageCount={activeAudit.pageCount} />
          )}

          {/* Audit Overview & Metrics Summary */}
          <AuditSummary
            audit={activeAudit}
            verifiedCount={verifiedCount}
            humanInputCount={humanCount}
            onOpenReport={() => setViewMode('report')}
          />

        {/* Filter Bar */}
        <FilterBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          severityFilter={severityFilter}
          onSeverityChange={setSeverityFilter}
          sourceFilter={sourceFilter}
          onSourceChange={setSourceFilter}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          totalCount={totalCount}
          verifiedCount={verifiedCount}
          detectedCount={detectedCount}
          humanCount={humanCount}
        />

        {/* Findings List Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-lg font-bold text-white flex items-center space-x-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              <span>Findings & Verified Fixes ({filteredFindings.length})</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              Sorted by priority rank (triageRank)
            </span>
          </div>

          {filteredFindings.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 text-center border border-slate-800 space-y-3">
              <AlertCircle className="w-10 h-10 text-slate-500 mx-auto" />
              <h4 className="text-base font-semibold text-slate-300">No findings match your current filters</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Try resetting your search query or changing filter tabs.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredFindings.map((finding) => (
                <FindingCard
                  key={finding.findingId}
                  finding={finding}
                  onOpenHumanGuidance={setSelectedHumanFinding}
                />
              ))}
            </div>
          )}
        </section>
      </main>
      )}

      {/* Human Guidance Modal */}
      <HumanGuidanceModal
        finding={selectedHumanFinding}
        onClose={() => setSelectedHumanFinding(null)}
      />

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#070a11] py-8 text-center text-xs text-slate-500 space-y-2">
        <div className="flex items-center justify-center space-x-2 text-slate-400 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>A11ySentinel — Google Cloud All Things Agentic Hackathon</span>
        </div>
        <p>
          Deterministic rule engine <code className="text-indigo-400 font-mono">axe-core 4.10.2</code> & Multimodal Agent <code className="text-indigo-400 font-mono">Gemini 3.7 Flash</code>.
        </p>
      </footer>

    </div>
  );
};
