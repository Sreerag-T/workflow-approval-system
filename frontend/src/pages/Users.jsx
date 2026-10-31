import { useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus } from 'lucide-react';
import { useCreateUserMutation, useGetRolesQuery, useGetUsersQuery, useUpdateUserMutation } from '../api/apiSlice';
import { Field, Modal, PageHead, Spinner } from '../components/ui';

const blank = { name: '', email: '', password: '', role_id: '', manager_id: '', designation: '', is_active: true };

export default function Users() {
  const { data: users, isLoading } = useGetUsersQuery();
  const { data: roles } = useGetRolesQuery();
  const [create] = useCreateUserMutation();
  const [update] = useUpdateUserMutation();
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});

  const save = async () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = 'Enter the full name';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email';
    if (!form.role_id) e.role_id = 'Choose a role';
    if (!form.id && form.password.length < 8) e.password = 'At least 8 characters';
    if (form.id && form.password && form.password.length < 8) e.password = 'At least 8 characters';
    setErrors(e);
    if (Object.keys(e).length) return;
    const body = { ...form, role_id: Number(form.role_id), manager_id: form.manager_id ? Number(form.manager_id) : null, designation: form.designation || null };
    if (!body.password) delete body.password;
    try {
      form.id ? await update(body).unwrap() : await create(body).unwrap();
      toast.success('User saved');
      setForm(null);
    } catch (err) { toast.error(err.message); }
  };

  if (isLoading) return <Spinner />;
  return (
    <>
      <PageHead title="Users and roles" subtitle="Manage who can sign in, what they can do and who their manager is.">
        <button className="btn" onClick={() => { setErrors({}); setForm(blank); }}><Plus size={16} />New user</button>
      </PageHead>
      <div className="card flush table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Manager</th><th>Status</th><th /></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}>
              <td className="title-cell"><b>{u.name}</b><span className="small muted">{u.email}{u.designation ? ` · ${u.designation}` : ''}</span></td>
              <td>{u.role}</td><td>{u.manager_name || '-'}</td>
              <td><span className={`badge ${u.is_active ? 'on' : 'off'}`}>{u.is_active ? 'Active' : 'Deactivated'}</span></td>
              <td className="right"><button className="btn ghost sm" onClick={() => { setErrors({}); setForm({ ...u, password: '', manager_id: u.manager_id || '', designation: u.designation || '', is_active: !!u.is_active }); }}><Pencil size={14} />Edit</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {form && (
        <Modal title={form.id ? 'Edit user' : 'New user'} onClose={() => setForm(null)} footer={<><button className="btn ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn" onClick={save}>Save user</button></>}>
          <div className="form-grid">
            <Field label="Full name" error={errors.name}><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email" error={errors.email}><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Role" error={errors.role_id}><select className="input" value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}><option value="">Select</option>{roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
            <Field label="Designation"><input className="input" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></Field>
            <Field label="Manager"><select className="input" value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })}><option value="">No manager</option>{users.filter((u) => u.id !== form.id && u.is_active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
            <Field label={form.id ? 'New password (optional)' : 'Password'} error={errors.password}><input className="input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            {form.id && <label className="check full"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />Active (can sign in)</label>}
          </div>
        </Modal>
      )}
    </>
  );
}
