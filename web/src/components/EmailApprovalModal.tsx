import React, { useState } from 'react';
import { Audit, Finding } from '../types/schema';
import { buildAuditEmailContent, sendApprovedEmail, EmailPayload } from '../services/emailService';
import { Mail, Check, X, AlertCircle, ShieldCheck, UserCheck, Send, Info, Eye } from 'lucide-react';

interface EmailApprovalModalProps {
  audit: Audit;
  findings: Finding[];
  isOpen: boolean;
  onClose: () => void;
  onEmailSent: () => void;
}

export const EmailApprovalModal: React.FC<EmailApprovalModalProps> = ({
  audit,
  findings,
  isOpen,
  onClose,
  onEmailSent,
}) => {
  if (!isOpen) return null;

  const defaultContent = buildAuditEmailContent(audit, findings);
  const [recipient, setRecipient] = useState(defaultContent.recipientEmail);
  const [subject, setSubject] = useState(defaultContent.subject);
  const [isApproved, setIsApproved] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'guards'>('preview');

  const handleApproveAndSend = async () => {
    if (!isApproved) return;
    setIsSending(true);

    const finalPayload: EmailPayload = {
      ...defaultContent,
      recipientEmail: recipient,
      subject,
    };

    try {
      await sendApprovedEmail(finalPayload);
      setIsSending(false);
      onEmailSent();
      onClose();
    } catch (err) {
      console.error('Email send failed:', err);
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel w-full max-w-3xl rounded-3xl border border-indigo-500/30 p-6 sm:p-8 shadow-2xl space-y-6 relative max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                  Deliverable B4 — Approval Gate
                </span>
                <span className="text-xs font-mono text-slate-400">{audit.auditId}</span>
              </div>
              <h3 className="text-xl font-bold text-white mt-0.5">
                Review & Approve Email Dispatch
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3 Outreach Guards Highlight Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-start space-x-2">
            <UserCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-emerald-300 block">1. Approval Gate</strong>
              <span className="text-slate-400">Requires human click to send. No automatic emails.</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-start space-x-2">
            <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-indigo-300 block">2. Neutral Copy</strong>
              <span className="text-slate-400">No legal threats, no panic framing, no scare marketing.</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-start space-x-2">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-300 block">3. Visible Opt-Out</strong>
              <span className="text-slate-400">Mandatory unsubscribe line included at footer.</span>
            </div>
          </div>
        </div>

        {/* Form Fields: Recipient & Subject */}
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-400 font-semibold mb-1">Recipient Contact Email:</label>
            <input
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full glass-input rounded-xl px-3.5 py-2.5 text-white text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">Email Subject Line:</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full glass-input rounded-xl px-3.5 py-2.5 text-white text-xs font-sans"
            />
          </div>
        </div>

        {/* Tab Selection: Preview vs Guards */}
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition ${
              activeTab === 'preview' 
                ? 'bg-indigo-600 text-white' 
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Email Render Preview</span>
          </button>
        </div>

        {/* Email Preview Box */}
        {activeTab === 'preview' && (
          <div className="rounded-2xl border border-slate-800 overflow-hidden bg-white p-4 max-h-64 overflow-y-auto text-slate-900 shadow-inner">
            <div dangerouslySetInnerHTML={{ __html: defaultContent.bodyHtml }} />
          </div>
        )}

        {/* Human Approval Checkbox (Approval Gate) */}
        <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 space-y-2">
          <label className="flex items-start space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isApproved}
              onChange={(e) => setIsApproved(e.target.checked)}
              className="mt-0.5 rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500/30 w-4 h-4"
            />
            <span className="text-xs text-indigo-200 font-medium leading-relaxed">
              <strong>Human Approval Confirmation:</strong> I have reviewed the email copy, verified the neutral non-litigious language and visible opt-out line, and explicitly approve sending this audit report to <code className="text-indigo-300 font-mono">{recipient}</code>.
            </span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-3 pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition"
          >
            Cancel
          </button>

          <button
            onClick={handleApproveAndSend}
            disabled={!isApproved || isSending}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isSending ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>Sending via Gmail API...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Approve & Send Email</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
