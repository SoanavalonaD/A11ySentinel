import React, { useEffect, useRef, useState } from 'react';
import { Audit, EmailDraft, EmailStatus, Finding } from '../types/schema';
import {
  buildAuditEmailContent,
  sendApprovedEmail,
  EmailPayload,
  DispatchResult,
  MAIL_TRANSPORT_URL,
} from '../services/emailService';
import { Mail, X, ShieldCheck, UserCheck, Send, Info, Check, Sparkles, FileText, AlertTriangle } from 'lucide-react';

interface EmailApprovalModalProps {
  audit: Audit;
  findings: Finding[];
  emailDraft?: EmailDraft | null;
  isOpen: boolean;
  onClose: () => void;
  onEmailSent: (status: EmailStatus) => void;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export const EmailApprovalModal: React.FC<EmailApprovalModalProps> = ({
  audit,
  findings,
  emailDraft,
  isOpen,
  onClose,
  onEmailSent,
}) => {
  // Every hook runs on every render. The early return sits below them —
  // returning before them changes the hook count between renders and React
  // throws on the next open.
  const defaultContent = buildAuditEmailContent(audit, findings, undefined, emailDraft);
  const [recipient, setRecipient] = useState(defaultContent.recipientEmail);
  const [subject, setSubject] = useState(defaultContent.subject);
  const [isApproved, setIsApproved] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [dispatch, setDispatch] = useState<DispatchResult | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      restoreFocusTo.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleApproveAndSend = async () => {
    if (!isApproved) return;
    setIsSending(true);

    const finalPayload: EmailPayload = {
      ...defaultContent,
      recipientEmail: recipient,
      subject,
    };

    try {
      const result = await sendApprovedEmail(finalPayload);
      setIsSending(false);
      setDispatch(result);
      // Carry the real status up. `approved` means a human signed off and
      // nothing was dispatched — the modal stays open saying so, rather than
      // closing on a success the code cannot claim.
      onEmailSent(result.status);
      if (result.delivered) onClose();
    } catch (err) {
      console.error('Email dispatch failed:', err);
      setIsSending(false);
      setDispatch({
        delivered: false,
        status: 'approved',
        detail: `Dispatch failed: ${err instanceof Error ? err.message : String(err)}. Nothing was sent.`,
      });
    }
  };

  const guards = [
    { Icon: UserCheck, title: '1. Approval Gate', body: 'Requires a human click. Nothing is ever dispatched automatically.' },
    { Icon: ShieldCheck, title: '2. Neutral Copy', body: 'No legal threats, no panic framing, no scare marketing.' },
    { Icon: Info, title: '3. Visible Opt-Out', body: 'Mandatory unsubscribe line included at footer.' },
  ];

  const fieldClass =
    'w-full bg-sunk border border-line2 px-3 py-2.5 text-[12.5px] text-head';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'color-mix(in srgb, var(--head) 55%, transparent)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-modal-title"
        className="panel card-shadow w-full max-w-[660px] max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-line2">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-9 h-9 shrink-0 grid place-items-center bg-sunk border border-line2">
              <Mail className="w-4 h-4 text-cyellow" strokeWidth={1.5} />
            </span>
            <div className="min-w-0">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.6px] text-cyellow">
                Human gate · nothing sends automatically
              </div>
              <h3 id="email-modal-title" className="text-[21px] font-bold text-head mt-0.5">
                Review &amp; Approve Email Dispatch
              </h3>
              <span className="font-mono text-[11px] text-bodyp">{audit.auditId}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-bodyp hover:text-head transition-colors shrink-0"
          >
            <span className="sr-only">Close</span>
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="space-y-3">
            <div>
              <label
                htmlFor="email-recipient"
                className="block text-[10.5px] font-bold uppercase tracking-[0.6px] text-bodyp mb-1.5"
              >
                Recipient Contact Email:
              </label>
              <input
                id="email-recipient"
                type="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className={`${fieldClass} font-mono`}
              />
            </div>

            <div>
              <label
                htmlFor="email-subject"
                className="block text-[10.5px] font-bold uppercase tracking-[0.6px] text-bodyp mb-1.5"
              >
                Email Subject Line:
              </label>
              <input
                id="email-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>

          {/* Where the prose came from. The approver should never have to guess
              whether a person or a model wrote what they are about to send. */}
          {defaultContent.narrativeSource === 'agent' ? (
            <p
              className="flex items-start gap-2 border border-violet p-3 text-[12.5px] text-bodyp"
              style={{ background: 'color-mix(in srgb, var(--violet) 8%, var(--bg))' }}
            >
              <Sparkles className="w-4 h-4 text-cviolet shrink-0 mt-0.5" strokeWidth={1.5} />
              <span>
                <strong className="text-cviolet font-semibold">Drafted by OutreachDrafter. </strong>
                The opening and the {emailDraft?.highlights.length} consequence sentence
                {emailDraft?.highlights.length === 1 ? '' : 's'} below were written by Agent 8 and
                passed its claim-discipline screen. The metrics, links, claim notice and opt-out
                footer are template text and were not model-written.
              </span>
            </p>
          ) : (
            <p className="flex items-start gap-2 border border-line2 p-3 text-[12.5px] text-bodyp">
              <FileText className="w-4 h-4 text-bodyp shrink-0 mt-0.5" strokeWidth={1.5} />
              <span>
                <strong className="text-head font-semibold">Static template. </strong>
                {emailDraft?.reason
                  ? `No agent narrative was used — ${emailDraft.reason}`
                  : 'No agent narrative was requested for this audit.'}
              </span>
            </p>
          )}

          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.6px] text-bodyp mb-1.5">
              Email Render Preview
            </div>
            {/*
              The email body carries its own inline styles and renders on white
              in a mail client. Previewing it on a themed surface would show the
              approver something the recipient never sees — and in dark mode
              would put its dark ink on a dark ground. Fixed white, both themes.
            */}
            <div
              className="border border-line2 p-4 max-h-64 overflow-y-auto text-[12.5px]"
              style={{ background: '#ffffff', color: '#1e293b' }}
            >
              <div dangerouslySetInnerHTML={{ __html: defaultContent.bodyHtml }} />
            </div>
          </div>

          <ul className="space-y-1.5">
            {guards.map(({ Icon, title, body }) => (
              <li key={title} className="flex items-start gap-2 text-[12.5px] text-bodyp">
                <Icon className="w-4 h-4 text-ccyan shrink-0 mt-0.5" strokeWidth={1.5} />
                <span>
                  <strong className="text-ccyan font-semibold">{title}: </strong>
                  {body}
                </span>
              </li>
            ))}
          </ul>

          <div
            className="border border-yellow p-4"
            style={{ background: 'color-mix(in srgb, var(--yellow) 10%, var(--bg))' }}
          >
            <label htmlFor="email-approve" className="flex items-start gap-3 cursor-pointer">
              <input
                id="email-approve"
                type="checkbox"
                checked={isApproved}
                onChange={(e) => setIsApproved(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0"
              />
              <span className="text-[12.5px] text-bodyp leading-relaxed">
                <strong className="text-head font-semibold">Human Approval Confirmation:</strong> I
                have reviewed the email copy, verified the neutral non-litigious language and visible
                opt-out line, and explicitly approve sending this audit report to{' '}
                <code className="font-mono text-cyellow">{recipient}</code>.
              </span>
            </label>
          </div>
        </div>

        {dispatch && (
          <div
            className={`mx-5 mb-1 flex items-start gap-2 border p-3 text-[12.5px] ${
              dispatch.delivered ? 'border-green' : 'border-yellow'
            }`}
            style={{
              background: dispatch.delivered
                ? 'color-mix(in srgb, var(--green) 10%, var(--bg))'
                : 'color-mix(in srgb, var(--yellow) 10%, var(--bg))',
            }}
            role="status"
          >
            {dispatch.delivered ? (
              <Check className="w-4 h-4 text-cgreen shrink-0 mt-0.5" strokeWidth={2} />
            ) : (
              <AlertTriangle className="w-4 h-4 text-cyellow shrink-0 mt-0.5" strokeWidth={1.5} />
            )}
            <span className="text-bodyp">
              <strong className={`font-semibold ${dispatch.delivered ? 'text-cgreen' : 'text-cyellow'}`}>
                {dispatch.delivered ? 'Delivered. ' : 'Approved, not sent. '}
              </strong>
              {dispatch.detail}
            </span>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 p-5 border-t border-line2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-line2 text-[12.5px] font-semibold text-bodyp hover:text-head hover:bg-sunk transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleApproveAndSend}
            disabled={!isApproved || isSending}
            className="flex items-center gap-2 px-5 py-2.5 bg-fill-yellow hover:bg-fill-yellow-h text-on-fill text-[12.5px] font-bold transition-colors disabled:opacity-[0.55] disabled:cursor-not-allowed disabled:hover:bg-fill-yellow"
          >
            {isSending ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                {MAIL_TRANSPORT_URL ? 'Sending...' : 'Recording approval...'}
              </>
            ) : (
              <>
                {isApproved ? (
                  <Check className="w-3.5 h-3.5" strokeWidth={2} />
                ) : (
                  <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
                )}
                {MAIL_TRANSPORT_URL ? 'Approve & Send Email' : 'Approve Email'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
