import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useGetApprovalReportQuery, useGetAuditLogsQuery } from '../api/apiSlice';
import { Empty, PageHead, Spinner, StatusBadge } from '../components/ui';
import { fmtDateTime } from '../utils';

export default function Reports() {
  const [tab, setTab] = useState('history');
  const history = useGetApprovalReportQuery();
  const audit = useGetAuditLogsQuery();

  return (
    <>
      <PageHead title="History and audit" subtitle="Every approval decision and every change made in the system." />
      <div className="tabs">
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>Approval history</button>
        <button className={tab === 'audit' ? 'on' : ''} onClick={() => setTab('audit')}>Audit log</button>
      </div>
      <div className="card flush">
        {tab === 'history' ? (
          !history.data ? <Spinner /> : !history.data.length ? <Empty title="No approval activity yet" /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>When</th><th>Request</th><th>Action</th><th>By</th><th>Comment</th></tr></thead>
              <tbody>{history.data.map((h) => (
                <tr key={h.id}>
                  <td>{fmtDateTime(h.created_at)}</td>
                  <td className="title-cell"><Link to={`/requests/${h.request_id}`}>{h.title}</Link><span className="small muted">{h.request_no} &middot; {h.requester_name} &middot; cycle {h.cycle_no}</span></td>
                  <td><StatusBadge status={h.action} />{h.step_name && <span className="small muted"> {h.step_name}</span>}</td>
                  <td>{h.actor_name || 'System'}</td><td className="muted">{h.comments || '-'}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )
        ) : !audit.data ? <Spinner /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>When</th><th>User</th><th>Event</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>{audit.data.map((a) => (
              <tr key={a.id}>
                <td>{fmtDateTime(a.created_at)}</td><td>{a.user_name || 'System'}</td>
                <td><b>{a.action.replaceAll('_', ' ').toLowerCase()}</b></td>
                <td>{a.entity_type} #{a.entity_id}</td>
                <td className="small muted" style={{ maxWidth: 320, wordBreak: 'break-word' }}>{a.details ? JSON.stringify(a.details) : '-'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
