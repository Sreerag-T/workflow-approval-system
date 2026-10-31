import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useGetMyHistoryQuery, useGetPendingQuery } from '../api/apiSlice';
import { Empty, PageHead, Spinner, StatusBadge, label } from '../components/ui';
import { fmtDateTime, money } from '../utils';

export default function Approvals() {
  const [tab, setTab] = useState('pending');
  const pending = useGetPendingQuery(undefined, { pollingInterval: 30000 });
  const history = useGetMyHistoryQuery();

  return (
    <>
      <PageHead title="Approvals" subtitle="Requests assigned to you and the decisions you have made." />
      <div className="tabs">
        <button className={tab === 'pending' ? 'on' : ''} onClick={() => setTab('pending')}>Pending{pending.data ? ` (${pending.data.length})` : ''}</button>
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>My approval history</button>
      </div>
      <div className="card flush">
        {tab === 'pending' ? (
          !pending.data ? <Spinner /> : !pending.data.length ? <Empty title="No pending approvals">When a request reaches your step it will appear here.</Empty> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Request</th><th>Requester</th><th>Your step</th><th>Value</th><th>Deadline</th><th /></tr></thead>
              <tbody>{pending.data.map((p) => (
                <tr key={p.instance_id}>
                  <td className="title-cell"><b>{p.title}</b><span className="small muted">{p.request_no} &middot; {p.type_name}</span></td>
                  <td>{p.requester_name}</td>
                  <td><span className="badge PENDING">{p.step_name}</span>{p.escalated ? <span className="chip" style={{ background: 'var(--red-l)', color: 'var(--red)', marginLeft: 6 }}>Escalated</span> : null}</td>
                  <td>{p.amount != null ? money(p.amount) : p.days ? `${p.days} day(s)` : '-'}</td>
                  <td>{p.due_at ? fmtDateTime(p.due_at) : <span className="muted">No deadline</span>}</td>
                  <td className="right"><Link className="btn sm" to={`/requests/${p.request_id}`}>Review</Link></td>
                </tr>
              ))}</tbody>
            </table></div>
          )
        ) : !history.data ? <Spinner /> : !history.data.length ? <Empty title="No decisions yet" /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Request</th><th>Requester</th><th>Your decision</th><th>Comment</th><th>When</th></tr></thead>
            <tbody>{history.data.map((h) => (
              <tr key={h.id}>
                <td className="title-cell"><Link to={`/requests/${h.request_id}`}>{h.title}</Link><span className="small muted">{h.request_no} &middot; {h.step_name}</span></td>
                <td>{h.requester_name}</td>
                <td><StatusBadge status={h.action} /></td>
                <td className="muted">{h.comments || '-'}</td>
                <td>{fmtDateTime(h.created_at)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
