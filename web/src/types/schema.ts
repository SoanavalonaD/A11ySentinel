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

export interface AuditResultResponse {
  audit: Audit;
  findings: Finding[];
}
