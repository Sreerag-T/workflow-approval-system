import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { useGetDashboardQuery } from '../api/apiSlice';
import { Empty, PageHead, Spinner, label } from '../components/ui';
import { fmtDateTime, money } from '../utils';

const COLORS = { Pending: '#b7791f', Approved: '#1c7c54', Rejected: '#b83a34', 'Changes requested': '#5b4bc4', Draft: '#98a2b3' };

export default function Dashboard() {
  const user = useSelector((s) => s.auth.user);
  const { data, isLoading } = useGetDashboardQuery();
  if (isLoading || !data) return <Spinner />;
  const { stats, byType, monthly, myTasks, recent } = data;
  const admin = user.role === 'Super Admin';
  const canApprove = admin || user.role === 'Approver';

  const pie = [['Pending', stats.pending], ['Approved', stats.approved], ['Rejected', stats.rejected], ['Changes requested', stats.changes], ['Draft', stats.drafts]]
    .filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));

  return (
    <>
      <PageHead title={`Hello, ${user.name.split(' ')[0]}`} subtitle={admin ? 'Everything happening across the organisation.' : 'Your requests and tasks at a glance.'}>
        <Link className="btn" to="/requests/new">New request</Link>
      </PageHead>

      <div className="grid-4">
        <div className="stat" style={{ '--c': '#0f1b2d' }}><div className="n">{stats.total}</div><div className="l">{admin ? 'Total requests' : 'My requests'}</div></div>
        <div className="stat" style={{ '--c': '#b7791f' }}><div className="n">{stats.pending}</div><div className="l">Pending</div></div>
        <div className="stat" style={{ '--c': '#1c7c54' }}><div className="n">{stats.approved}</div><div className="l">Approved</div></div>
        <div className="stat" style={{ '--c': '#b83a34' }}><div className="n">{stats.rejected}</div><div className="l">Rejected</div></div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        {canApprove ? (
          <div className="card">
            <div className="card-head"><h2>My pending tasks ({myTasks.count})</h2><Link to="/approvals">View all</Link></div>
            {!myTasks.items.length ? <Empty title="Nothing waiting for you">New approvals will show up here.</Empty> : (
              <div className="stack" style={{ gap: 0 }}>
                {myTasks.items.map((t) => (
                  <Link key={t.instance_id} to={`/requests/${t.request_id}`} style={{ color: 'inherit', fontWeight: 500, padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
                    <div className="row between"><b>{t.title}</b><span className="badge PENDING">{t.step_name}</span></div>
                    <div className="small muted">{t.request_no} &middot; {t.type_name} &middot; {t.requester_name}{t.amount ? ` · ${money(t.amount)}` : ''}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="card">
            <div className="card-head"><h2>Requests by month</h2></div>
            <Chart monthly={monthly} />
          </div>
        )}
        <div className="card">
          <div className="card-head"><h2>Status breakdown</h2></div>
          {!pie.length ? <Empty title="No requests yet">Create your first request to see statistics.</Empty> : (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={2}>
                  {pie.map((p) => <Cell key={p.name} fill={COLORS[p.name]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        {canApprove && <div className="card"><div className="card-head"><h2>Requests by month</h2></div><Chart monthly={monthly} /></div>}
        <div className="card">
          <div className="card-head"><h2>Requests by type</h2></div>
          {!byType.length ? <Empty title="No data yet" /> : byType.map((t) => (
            <div key={t.name} style={{ marginBottom: 12 }}>
              <div className="row between small"><b>{t.name}</b><span>{t.count}</span></div>
              <div style={{ height: 7, background: 'var(--grey-l)', borderRadius: 4 }}>
                <div style={{ height: 7, borderRadius: 4, background: 'var(--teal)', width: `${(t.count / stats.total) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="card" style={canApprove ? { gridColumn: '1 / -1' } : {}}>
          <div className="card-head"><h2>Recent activity</h2></div>
          {!recent.length ? <Empty title="No activity yet" /> : recent.map((a) => (
            <div key={a.id} className="row between" style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
              <span><b>{a.actor_name || 'System'}</b> {label(a.action).toLowerCase()} <Link to={`/requests/${a.request_id}`}>{a.request_no}</Link> <span className="muted">{a.title}</span></span>
              <span className="small muted">{fmtDateTime(a.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Chart({ monthly }) {
  if (!monthly.length) return <Empty title="No data yet" />;
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={monthly}>
        <CartesianGrid vertical={false} stroke="#e3e7ed" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={28} />
        <Tooltip cursor={{ fill: '#f2f4f7' }} />
        <Bar dataKey="count" name="Requests" fill="#0e7c7b" radius={[5, 5, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
