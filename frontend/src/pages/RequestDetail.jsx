import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Paperclip, Pencil, Send, Ban, Check, X, RotateCcw } from 'lucide-react';
import { useActOnApprovalMutation, useCancelRequestMutation, useGetRequestQuery, useSubmitRequestMutation } from '../api/apiSlice';
import { http } from '../api/http';
import { ApprovalRail, Modal, PageHead, Spinner, StatusBadge, label } from '../components/ui';
import { fmtDate, fmtDateTime, money } from '../utils';

const DOT = { SUBMITTED: '#0e7c7b', APPROVED: '#1c7c54', REJECTED: '#b83a34', CHANGES_REQUESTED: '#5b4bc4', CANCELLED: '#98a2b3', ESCALATED: '#b7791f', SKIPPED: '#98a2b3' };

export default function RequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: r, isLoading, error } = useGetRequestQuery(id);
  const [act, { isLoading: acting }] = useActOnApprovalMutation();
  const [submit, { isLoading: submitting }] = useSubmitRequestMutation();
  const [cancel, { isLoading: cancelling }] = useCancelRequestMutation();
  const [comment, setComment] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cycle, setCycle] = useState(null);

  if (isLoading) return <Spinner />;
  if (error || !r) return <div className="card empty"><h3>{error?.message || 'Request not found'}</h3><Link to="/requests">Back to requests</Link></div>;

  const latest = r.current_cycle;
  const shown = cycle || latest;
  const instances = r.instances.filter((i) => i.cycle_no === shown);
  const p = r.permissions;

  const decide = async (action) => {
    if (action !== 'APPROVED' && comment.trim().length < 3) return toast.error('Please add a comment explaining your decision');
    try {
      const out = await act({ id: p.pendingInstanceId, action, comments: comment.trim() || undefined }).unwrap();
      toast.success(action === 'APPROVED' ? (out.status === 'APPROVED' ? 'Fully approved' : 'Approved - sent to the next level') : action === 'REJECTED' ? 'Request rejected' : 'Changes requested');
      setComment('');
    } catch (e) { toast.error(e.message); }
  };

  const download = async (a) => {
    try {
      const res = await http.get(`/requests/${r.id}/attachments/${a.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const link = Object.assign(document.createElement('a'), { href: url, download: a.original_name });
      link.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Could not download the file'); }
  };

  return (
    <>
      <PageHead title={r.title} subtitle={`${r.request_no} - ${r.type_name}`}>
        <StatusBadge status={r.status} />
        {p.canEdit && <Link className="btn ghost" to={`/requests/${r.id}/edit`}><Pencil size={15} />Edit</Link>}
        {p.canSubmit && (
          <button className="btn" disabled={submitting} onClick={() => submit(r.id).unwrap().then((o) => toast.success(`Submitted via "${o.workflow}"`)).catch((e) => toast.error(e.message))}>
            <Send size={15} />{latest > 0 ? 'Resubmit' : 'Submit'}
          </button>
        )}
        {p.canCancel && <button className="btn ghost" onClick={() => setConfirmCancel(true)}><Ban size={15} />Cancel request</button>}
      </PageHead>

      <div className="stack">
        {r.status === 'CHANGES_REQUESTED' && <div className="notice">The approver asked for changes. Update the request and resubmit - it will start a new approval cycle.</div>}

        {p.pendingInstanceId && (
          <div className="card action-panel">
            <h2 style={{ marginBottom: 4 }}>Your decision</h2>
            <p className="muted" style={{ margin: '0 0 12px' }}>This request is waiting for you. Comments are required to reject or request changes.</p>
            <textarea className="input" rows={3} placeholder="Add a comment" value={comment} onChange={(e) => setComment(e.target.value)} />
            <div className="row wrap" style={{ marginTop: 12 }}>
              <button className="btn green" disabled={acting} onClick={() => decide('APPROVED')}><Check size={16} />Approve</button>
              <button className="btn warn" disabled={acting} onClick={() => decide('CHANGES_REQUESTED')}><RotateCcw size={16} />Request changes</button>
              <button className="btn danger" disabled={acting} onClick={() => decide('REJECTED')}><X size={16} />Reject</button>
            </div>
          </div>
        )}

        <div className="card">
          <dl className="detail-grid" style={{ margin: 0 }}>
            <div><dt>Requested by</dt><dd>{r.requester_name}</dd></div>
            {r.amount != null && <div><dt>Amount</dt><dd>{money(r.amount)}</dd></div>}
            {r.start_date && <div><dt>Dates</dt><dd>{fmtDate(r.start_date)} - {fmtDate(r.end_date)} ({r.days} day{r.days > 1 ? 's' : ''})</dd></div>}
            <div><dt>Submitted</dt><dd>{r.submitted_at ? fmtDateTime(r.submitted_at) : 'Not yet'}</dd></div>
            <div><dt>Workflow</dt><dd>{r.workflow_name ? `${r.workflow_name} (v${r.workflow_version})` : '-'}</dd></div>
            <div><dt>Approval cycle</dt><dd>{latest || '-'}</dd></div>
          </dl>
          {r.description && <p style={{ margin: '18px 0 0', whiteSpace: 'pre-wrap' }}>{r.description}</p>}
          {r.attachments.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {r.attachments.map((a) => <button key={a.id} className="file-pill" style={{ border: 0, cursor: 'pointer' }} onClick={() => download(a)}><Paperclip size={14} />{a.original_name}</button>)}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Approval progress</h2>
            {latest > 1 && (
              <select className="input" style={{ width: 'auto' }} value={shown} onChange={(e) => setCycle(Number(e.target.value))} aria-label="Approval cycle">
                {Array.from({ length: latest }, (_, i) => latest - i).map((c) => <option key={c} value={c}>Cycle {c}{c === latest ? ' (current)' : ''}</option>)}
              </select>
            )}
          </div>
          <ApprovalRail instances={instances} />
        </div>

        <div className="card">
          <h2 style={{ marginBottom: 16 }}>History</h2>
          {!r.history.length ? <p className="muted" style={{ margin: 0 }}>Nothing has happened yet.</p> : (
            <ul className="timeline">
              {[...r.history].reverse().map((h) => (
                <li key={h.id} style={{ '--c': DOT[h.action] }}>
                  <div><b>{label(h.action)}</b>{h.step_name ? ` at ${h.step_name}` : ''} <span className="muted">by {h.actor_name || 'System'}</span></div>
                  <div className="small muted">{fmtDateTime(h.created_at)} &middot; cycle {h.cycle_no}</div>
                  {h.comments && <div className="quote">{h.comments}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {confirmCancel && (
        <Modal title="Cancel this request?" onClose={() => setConfirmCancel(false)} footer={<>
          <button className="btn ghost" onClick={() => setConfirmCancel(false)}>Keep request</button>
          <button className="btn danger" disabled={cancelling} onClick={() => cancel(r.id).unwrap().then(() => { toast.success('Request cancelled'); setConfirmCancel(false); }).catch((e) => toast.error(e.message))}>Cancel request</button>
        </>}>
          <p style={{ margin: 0 }}>Pending approvals will be withdrawn and nobody will be able to act on it. This cannot be undone.</p>
        </Modal>
      )}
    </>
  );
}
