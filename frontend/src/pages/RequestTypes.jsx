import { useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus } from 'lucide-react';
import { useCreateTypeMutation, useGetTypesQuery, useUpdateTypeMutation } from '../api/apiSlice';
import { Field, Modal, PageHead, Spinner } from '../components/ui';

const blank = { name: '', code: '', description: '', requires_amount: false, requires_dates: false, is_active: true };

export default function RequestTypes() {
  const { data, isLoading } = useGetTypesQuery();
  const [create] = useCreateTypeMutation();
  const [update] = useUpdateTypeMutation();
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});

  const save = async () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = 'Enter a name';
    if (!/^[A-Za-z0-9_]{2,30}$/.test(form.code)) e.code = '2-30 letters, digits or underscore';
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      const body = { ...form, code: form.code.toUpperCase(), description: form.description || null };
      form.id ? await update(body).unwrap() : await create(body).unwrap();
      toast.success('Request type saved');
      setForm(null);
    } catch (err) { toast.error(err.message); }
  };

  if (isLoading) return <Spinner />;
  return (
    <>
      <PageHead title="Request types" subtitle="Types employees can raise. Amount and date fields decide what the form asks for and which conditions workflows can use.">
        <button className="btn" onClick={() => { setErrors({}); setForm(blank); }}><Plus size={16} />New type</button>
      </PageHead>
      <div className="card flush table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Code</th><th>Asks for</th><th>Status</th><th /></tr></thead>
          <tbody>{data.map((t) => (
            <tr key={t.id}>
              <td className="title-cell"><b>{t.name}</b><span className="small muted">{t.description}</span></td>
              <td>{t.code}</td>
              <td>{[t.requires_amount && 'Amount', t.requires_dates && 'Dates'].filter(Boolean).join(', ') || 'Title and description only'}</td>
              <td><span className={`badge ${t.is_active ? 'on' : 'off'}`}>{t.is_active ? 'Active' : 'Disabled'}</span></td>
              <td className="right"><button className="btn ghost sm" onClick={() => { setErrors({}); setForm({ ...t, description: t.description || '', requires_amount: !!t.requires_amount, requires_dates: !!t.requires_dates, is_active: !!t.is_active }); }}><Pencil size={14} />Edit</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {form && (
        <Modal title={form.id ? 'Edit request type' : 'New request type'} onClose={() => setForm(null)} footer={<><button className="btn ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
          <div className="stack">
            <Field label="Name" error={errors.name}><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Code" error={errors.code}><input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. TRAVEL" /></Field>
            <Field label="Description"><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <label className="check"><input type="checkbox" checked={form.requires_amount} onChange={(e) => setForm({ ...form, requires_amount: e.target.checked })} />Ask for an amount</label>
            <label className="check"><input type="checkbox" checked={form.requires_dates} onChange={(e) => setForm({ ...form, requires_dates: e.target.checked })} />Ask for start and end dates</label>
            <label className="check"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />Active (employees can raise it)</label>
          </div>
        </Modal>
      )}
    </>
  );
}
