/**
 * Authoritative schema matching contracts/schema.md (Draft 4)
 */

export type AuditTrigger = 'manual' | 'prospect';

export type AuditStatus = 
  | 'queued' 
  | 'capturing' 
  | 'auditing' 
  | 'remediating' 
  | 'verifying' 
  | 'complete' 
  | 'failed';

export type EmailStatus = 'draft' | 'approved' | 'sent';

export interface Audit {
  auditId: string;
  targetUrl: string;
  trigger: AuditTrigger;
  status: AuditStatus;
  createdAt: string;
  completedAt: string | null;
  pageCount: number;
  violationsBefore: number;
  violationsAfter: number | null;
  proxyUrl: string | null;
  emailStatus: EmailStatus;
  error: string | null;
}

export type FindingSource = 'axe' | 'visual';

export type FindingSeverity = 'critical' | 'serious' | 'moderate' | 'minor';

export type FrameworkType = 'react' | 'html' | 'unknown';

export type FindingStatus = 'detected' | 'patched' | 'verified';

export interface Finding {
  findingId: string;
  pageUrl: string;
  source: FindingSource;
  category: string;
  wcagCriterion: string;
  regionalFramework: string | null;
  regionalCriterion: string | null;
  severity: FindingSeverity;
  userImpact: string;
  evidence: string | null;
  selector: string;
  xpath: string | null;
  currentCode: string;
  patchedCode: string | null;
  changeSummary: string | null;
  requiresHumanInput: boolean;
  humanGuidance: string | null;
  framework: FrameworkType;
  confidence: number;
  status: FindingStatus;
  verified: boolean;
  triageRank: number | null;
  screenshotRef: string | null;
  announcedBefore: string | null;
  announcedAfter: string | null;
}

export type AgentName = 
  | 'RootOrchestrator' 
  | 'RuleAuditor' 
  | 'VisualAuditor' 
  | 'TriageAgent' 
  | 'RemediationFanOut' 
  | 'Remediator' 
  | 'Verifier'
  | 'OutreachDrafter';

export type LogLevel = 'info' | 'success' | 'warn' | 'error';

export interface AgentAuditLogEntry {
  logId: string;
  timestamp: string;
  agentName: AgentName;
  level: LogLevel;
  message: string;
  details?: string;
  stage?: string;
}

export interface AuditWriteReport {
  findingsWritten?: number;
  findingsRejected?: Array<{ findingId: string; reason: string }>;
  error?: string;
}

/**
 * Agent 8's narrative. A proposal, never a message — the human approval gate
 * is still the only thing that can dispatch anything.
 *
 * `drafted: false` is a normal outcome, not an error: it means the model
 * failed, cited a finding we never supplied, or broke claim discipline, and
 * the static template should be used instead. Never render these fields
 * without checking `drafted` first, and never show `reason` to a recipient —
 * it is diagnostic text for the dashboard.
 *
 * What the model does NOT write, and the template must keep owning: the
 * metrics, every link, the claim-discipline notice, the opt-out footer and
 * the subject line.
 */
export interface EmailDraftHighlight {
  findingId: string;
  sentence: string;
}

export interface EmailDraft {
  drafted: boolean;
  modelUsed: boolean;
  opening: string | null;
  highlights: EmailDraftHighlight[];
  closing: string | null;
  language: string | null;
  reason: string | null;
  screened: string | null;
}

export interface AuditResultResponse {
  audit: Audit;
  findings: Finding[];
  notes?: string[];
  write?: AuditWriteReport;
  emailDraft?: EmailDraft | null;
  auditLogs?: AgentAuditLogEntry[];
}
