import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { LayoutDashboard, FilePlus2, FileText, CheckSquare, GitBranch, Tags, Users, BarChart3, Bell, LogOut, Menu, Workflow } from 'lucide-react';
import { useGetNotificationsQuery, useReadAllNotificationsMutation } from '../api/apiSlice';
import { resetApiOnLogout } from '../store';
import { fmtDateTime } from '../utils';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/requests/new', label: 'New request', icon: FilePlus2 },
  { to: '/requests', label: 'Requests', icon: FileText, end: true },
  { to: '/approvals', label: 'Approvals', icon: CheckSquare, roles: ['Approver', 'Super Admin'] },
  { section: 'Administration', roles: ['Super Admin'] },
  { to: '/workflows', label: 'Workflows', icon: GitBranch, roles: ['Super Admin'] },
  { to: '/request-types', label: 'Request types', icon: Tags, roles: ['Super Admin'] },
  { to: '/users', label: 'Users', icon: Users, roles: ['Super Admin'] },
  { to: '/reports', label: 'History & audit', icon: BarChart3, roles: ['Super Admin'] },
];

function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const { data } = useGetNotificationsQuery(undefined, { pollingInterval: 30000 });
  const [readAll] = useReadAllNotificationsMutation();

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" aria-label="Notifications" onClick={() => setOpen(!open)}>
        <Bell size={20} />
        {data?.unread > 0 && <span className="dot">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <div className="popover">
          <div className="row between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
            <h3>Notifications</h3>
            {data?.unread > 0 && <button className="btn ghost sm" onClick={() => readAll()}>Mark all read</button>}
          </div>
          {!data?.items?.length && <div className="empty small">You're all caught up.</div>}
          {data?.items?.map((n) => (
            <a key={n.id} className={`notif ${n.is_read ? '' : 'unread'}`} onClick={() => { setOpen(false); n.request_id && navigate(`/requests/${n.request_id}`); }}>
              <div>{n.message}</div>
              <div className="small muted">{fmtDateTime(n.created_at)}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const user = useSelector((s) => s.auth.user);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="shell">
      <div className={`backdrop ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand"><span className="brand-mark"><Workflow size={20} /></span>Axentriq Flow</div>
        <nav className="nav">
          {NAV.filter((n) => !n.roles || n.roles.includes(user.role)).map((n) =>
            n.section ? <div key={n.section} className="sep">{n.section}</div> : (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                <n.icon size={18} />{n.label}
              </NavLink>
            )
          )}
        </nav>
        <div className="side-user">
          <b>{user.name}</b>
          <span>{user.role}</span>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={22} /></button>
          <Notifications />
          <button className="btn ghost sm" onClick={resetApiOnLogout}><LogOut size={15} />Sign out</button>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
