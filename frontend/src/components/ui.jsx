import { useEffect } from 'react';
import { X, Check, Clock, Ban, RotateCcw, SkipForward, Hourglass } from 'lucide-react';
import { fmtDateTime } from '../utils';

const LABELS = {
  DRAFT: 'Draft', PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', CHANGES_REQUESTED: 'Changes requested',
  CANCELLED: 'Cancelled', WAITING: 'Waiting', SKIPPED: 'Skipped', SUBMITTED: 'Submitted', ESCALATED: 'Escalated',
};
export const StatusBadge = ({ status }) => <span className={`badge ${status}`}>{LABELS[status] || status}</span>;
export const label = (s) => LABELS[s] || s;

export const Spinner = () => <div className="spinner" role="status" aria-label="Loading" />;

export const Empty = ({ title, children }) => (
  <div className="empty">
    <h3>{title}</h3>
    <div>{children}</div>
  </div>
);

export const PageHead = ({ title, subtitle, children }) => (
  <div className="page-head">
    <div>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
    <div className="row wrap">{children}</div>
  </div>
);

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export const Field = ({ label: l, error, children, className = '' }) => (
  <label className={`f ${className}`}>
    {l}
    {children}
    {error && <span className="err-text">{error}</span>}
  </label>
);

const railIcon = { APPROVED: Check, PENDING: Clock, REJECTED: Ban, CHANGES_REQUESTED: RotateCcw, SKIPPED: SkipForward, WAITING: Hourglass, CANCELLED: Ban };
const railClass = { APPROVED: 'done', PENDING: 'active', REJECTED: 'rejected', CHANGES_REQUESTED: 'changes', SKIPPED: 'faded', CANCELLED: 'faded', WAITING: '' };

/** The approval chain of one cycle: who approved, who is holding the request now, who is next. */
export function ApprovalRail({ instances }) {
  if (!instances.length) return <p className="muted">This request has not been submitted yet.</p>;
  return (
    <div className="rail">
      {instances.map((i) => {
        const Icon = railIcon[i.status] || Clock;
        const who = i.acted_by_name || i.assigned_user_name || (i.assigned_role_name ? `Any ${i.assigned_role_name}` : 'To be assigned');
        return (
          <div key={i.id} className={`rail-step ${railClass[i.status]}`}>
            <div className="rail-node"><Icon size={18} /></div>
            <b>{i.step_name}</b>
            <div className="small muted">{who}</div>
            <div style={{ marginTop: 5 }}><StatusBadge status={i.status} /></div>
            {i.status === 'PENDING' && i.due_at && <div className="small muted" style={{ marginTop: 4 }}>Due {fmtDateTime(i.due_at)}</div>}
            {i.escalated ? <div className="small" style={{ color: 'var(--red)', fontWeight: 700, marginTop: 4 }}>Escalated</div> : null}
          </div>
        );
      })}
    </div>
  );
}

export const MiniRail = ({ steps }) => (
  <div className="mini-rail">
    {steps.map((s, i) => (
      <span key={s.id} className="row" style={{ gap: 6 }}>
        {i > 0 && <span className="a">&rarr;</span>}
        <span className="s">{s.name}</span>
      </span>
    ))}
  </div>
);

export function Pager({ page, limit, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="pager">
      <span className="muted small">{total} request{total === 1 ? '' : 's'}</span>
      <div className="row">
        <button className="btn ghost sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span className="small">Page {page} of {pages}</span>
        <button className="btn ghost sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
