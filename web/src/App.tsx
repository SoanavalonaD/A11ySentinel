import React, { useState } from 'react';
import { Audit, EmailStatus, Finding, FindingSeverity, FindingSource } from './types/schema';
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
import { EmailApprovalModal } from './components/EmailApprovalModal';
import { AgentAuditLogs } from './components/AgentAuditLogs';

import { ShieldCheck, Layers, AlertCircle, FileCheck2, Code2 } from 'lucide-react';

export const App: React.FC = () => {
  const [activeAudit, setActiveAudit] = useState<Audit>(SAMPLE_FIXTURE.audit);
  const [findings, setFindings] = useState<Finding[]>(SAMPLE_FIXTURE.findings);
  const [activeFixtureName, setActiveFixtureName] = useState<'sample' | 'demo' | 'custom'>('sample');

  const [activeNotes, setActiveNotes] = useState<string[] | undefined>(SAMPLE_FIXTURE.notes);
  const [activeWrite, setActiveWrite] = useState(SAMPLE_FIXTURE.write);
  const [activeLogs, setActiveLogs] = useState(SAMPLE_FIXTURE.auditLogs);
  const [activeEmailDraft, setActiveEmailDraft] = useState(SAMPLE_FIXTURE.emailDraft);

  const [isLoading, setIsLoading] = useState(false);
  const [selectedHumanFinding, setSelectedHumanFinding] = useState<Finding | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

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
      setActiveNotes(SAMPLE_FIXTURE.notes);
      setActiveWrite(SAMPLE_FIXTURE.write);
      setActiveLogs(SAMPLE_FIXTURE.auditLogs);
      setActiveEmailDraft(SAMPLE_FIXTURE.emailDraft);
    } else {
      setActiveAudit(DEMO_SITE_FIXTURE.audit);
      setFindings(DEMO_SITE_FIXTURE.findings);
      setActiveNotes(DEMO_SITE_FIXTURE.notes);
      setActiveWrite(DEMO_SITE_FIXTURE.write);
      setActiveLogs(DEMO_SITE_FIXTURE.auditLogs);
      setActiveEmailDraft(DEMO_SITE_FIXTURE.emailDraft);
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
        setActiveAudit(result.audit);
        setFindings(result.findings);
        if (result.notes) setActiveNotes(result.notes);
        if (result.write) setActiveWrite(result.write);
        if (result.auditLogs) setActiveLogs(result.auditLogs);
        setActiveEmailDraft(result.emailDraft ?? undefined);
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
        targetUrl={activeAudit.targetUrl}
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
        <main className="flex-grow max-w-[1280px] w-full mx-auto px-6 py-8 space-y-7">
          
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
            onOpenEmailModal={() => setIsEmailModalOpen(true)}
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
          <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-head pb-2">
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-[0.6px] text-bodyp">
                Evidence
              </div>
              <h3 className="text-[21px] font-bold text-head flex items-center gap-2 mt-0.5">
                <Layers className="w-5 h-5 text-cblue" strokeWidth={1.5} />
                Findings &amp; Verified Fixes
              </h3>
            </div>
            <span className="font-mono text-[11px] text-bodyp">
              sorted by triage rank · showing {filteredFindings.length} of {totalCount}
            </span>
          </div>

          {filteredFindings.length === 0 ? (
            <div className="panel card-shadow p-12 text-center space-y-2">
              <AlertCircle className="w-9 h-9 text-bodyp mx-auto" strokeWidth={1.5} />
              <h4 className="text-[14px] font-semibold text-head">
                No findings match your current filters
              </h4>
              <p className="text-[12.5px] text-bodyp max-w-md mx-auto">
                Try resetting your search query or changing filter tabs.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredFindings.map((finding, idx) => (
                <FindingCard
                  key={finding.findingId}
                  finding={finding}
                  index={idx}
                  onOpenHumanGuidance={setSelectedHumanFinding}
                />
              ))}
            </div>
          )}
        </section>

        {/* Agent Audit Logs & Pipeline Decision Trail */}
        <AgentAuditLogs
          auditLogs={activeLogs}
          notes={activeNotes}
          write={activeWrite}
        />

      </main>
      )}

      {/* Human Guidance Modal */}
      <HumanGuidanceModal
        finding={selectedHumanFinding}
        onClose={() => setSelectedHumanFinding(null)}
      />

      {/* Deliverable B4 — Email Approval Modal */}
      <EmailApprovalModal
        audit={activeAudit}
        findings={findings}
        emailDraft={activeEmailDraft}
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        onEmailSent={(status: EmailStatus) => {
          // Whatever actually happened — `approved` when a human signed off but
          // no transport dispatched it. Never assume 'sent'.
          setActiveAudit((prev) => ({ ...prev, emailStatus: status }));
        }}
      />

      {/* Footer */}
      <footer className="border-t border-line2 bg-panel py-8 px-6 text-center text-[12px] text-bodyp space-y-2 print-hide">
        <div className="flex items-center justify-center gap-2 font-semibold text-head">
          <ShieldCheck className="w-4 h-4 text-cgreen" strokeWidth={1.5} />
          <span>A11ySentinel — Google Cloud All Things Agentic Hackathon</span>
        </div>
        <p>
          Deterministic rule engine <code className="font-mono text-cblue">axe-core 4.10.2</code> &amp;
          Multimodal Agent <code className="font-mono text-cblue">Gemini 3.7 Flash</code>.
        </p>
      </footer>

    </div>
  );
};
