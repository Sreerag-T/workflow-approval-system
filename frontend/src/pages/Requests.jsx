import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useGetRequestsQuery, useGetTypesQuery } from '../api/apiSlice';
import { Empty, Pager, PageHead, Spinner, StatusBadge } from '../components/ui';
import { fmtDate, money } from '../utils';

const STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'CANCELLED'];

export default function Requests() {
  const user = useSelector((s) => s.auth.user);
  const admin = user.role === 'Super Admin';
  const navigate = useNavigate();
  const [f, setF] = useState({ q: '', status: '', type: '', mine: '', page: 1 });
  const { data: types } = useGetTypesQuery();
  const { data, isFetching } = useGetRequestsQuery({ ...f, limit: 10 });
  const set = (k, v) => setF({ ...f, [k]: v, page: k === 'page' ? v : 1 });

  return (
    <>
      <PageHead title={admin ? 'All requests' : 'My requests'} subtitle="Track status and approval progress.">
        <Link className="btn" to="/requests/new">New request</Link>
      </PageHead>
      <div className="card flush">
        <div className="filters">
          <input className="input" placeholder="Search title or number" value={f.q} onChange={(e) => set('q', e.target.value)} />
          <select className="input" value={f.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}</option>)}
          </select>
          <select className="input" value={f.type} onChange={(e) => set('type', e.target.value)}>
            <option value="">All types</option>
            {types?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {admin && <select className="input" value={f.mine} onChange={(e) => set('mine', e.target.value)}><option value="">Everyone's requests</option><option value="1">Only mine</option></select>}
        </div>
        {!data ? <Spinner /> : !data.data.length ? (
          <Empty title="No requests found">{f.q || f.status || f.type ? 'Try clearing the filters.' : <Link to="/requests/new">Create your first request</Link>}</Empty>
        ) : (
          <div className="table-wrap" style={{ opacity: isFetching ? .6 : 1 }}>
            <table>
              <thead><tr><th>Request</th><th>Type</th>{admin && <th>Requester</th>}<th>Amount / days</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>
                {data.data.map((r) => (
                  <tr key={r.id} className="click" onClick={() => navigate(`/requests/${r.id}`)}>
                    <td className="title-cell"><b>{r.title}</b><span className="small muted">{r.request_no}</span></td>
                    <td>{r.type_name}</td>
                    {admin && <td>{r.requester_name}</td>}
                    <td>{r.amount != null ? money(r.amount) : r.days ? `${r.days} day${r.days > 1 ? 's' : ''}` : '-'}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>{fmtDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} limit={data.limit} total={data.total} onPage={(p) => set('page', p)} />}
      </div>
    </>
  );
}
