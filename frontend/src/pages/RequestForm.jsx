import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Paperclip, X } from 'lucide-react';
import {
  useCreateRequestMutation, useDeleteAttachmentMutation, useGetRequestQuery, useGetTypesQuery,
  useSubmitRequestMutation, useUpdateRequestMutation, useUploadFilesMutation,
} from '../api/apiSlice';
import { Field, PageHead, Spinner } from '../components/ui';
import { toInputDate } from '../utils';

const EMPTY = { request_type_id: '', title: '', description: '', amount: '', start_date: '', end_date: '' };

export default function RequestForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { data: types } = useGetTypesQuery();
  const { data: existing } = useGetRequestQuery(id, { skip: !editing });
  const [create] = useCreateRequestMutation();
  const [update] = useUpdateRequestMutation();
  const [submit] = useSubmitRequestMutation();
  const [upload] = useUploadFilesMutation();
  const [removeAtt] = useDeleteAttachmentMutation();

  const [form, setForm] = useState(EMPTY);
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (existing) {
      if (!existing.permissions.canEdit) { toast.error('This request can no longer be edited'); navigate(`/requests/${id}`); return; }
      setForm({
        request_type_id: existing.request_type_id, title: existing.title, description: existing.description || '',
        amount: existing.amount ?? '', start_date: toInputDate(existing.start_date), end_date: toInputDate(existing.end_date),
      });
    }
  }, [existing]); // eslint-disable-line

  const type = types?.find((t) => t.id === Number(form.request_type_id));
  const set = (k, v) => { setForm({ ...form, [k]: v }); setErrors({ ...errors, [k]: undefined }); };

  const validate = () => {
    const e = {};
    if (!form.request_type_id) e.request_type_id = 'Choose a request type';
    if (form.title.trim().length < 3) e.title = 'Title must be at least 3 characters';
    if (type?.requires_amount && !(Number(form.amount) > 0)) e.amount = 'Enter an amount greater than 0';
    if (type?.requires_dates) {
      if (!form.start_date) e.start_date = 'Choose a start date';
      if (!form.end_date) e.end_date = 'Choose an end date';
      if (form.start_date && form.end_date && form.end_date < form.start_date) e.end_date = 'End date cannot be before the start date';
    }
    const big = files.find((f) => f.size > 5 * 1024 * 1024);
    if (big) e.files = `${big.name} is larger than 5 MB`;
    setErrors(e);
    return !Object.keys(e).length;
  };

  const persist = async (andSubmit) => {
    if (!validate()) return;
    setBusy(true);
    const payload = {
      request_type_id: Number(form.request_type_id), title: form.title.trim(), description: form.description || null,
      amount: type?.requires_amount ? Number(form.amount) : null,
      start_date: type?.requires_dates ? form.start_date : null, end_date: type?.requires_dates ? form.end_date : null,
    };
    try {
      const rid = editing ? (await update({ id, ...payload }).unwrap(), Number(id)) : (await create(payload).unwrap()).id;
      if (files.length) {
        const fd = new FormData();
        files.forEach((f) => fd.append('files', f));
        await upload({ id: rid, formData: fd }).unwrap();
      }
      if (andSubmit) {
        const out = await submit(rid).unwrap();
        toast.success(`Submitted - routed through "${out.workflow}"`);
      } else toast.success('Draft saved');
      navigate(`/requests/${rid}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!types || (editing && !existing)) return <Spinner />;

  return (
    <>
      <PageHead title={editing ? 'Edit request' : 'New request'} subtitle="Save a draft any time. Approvers only see it once you submit." />
      <div className="card" style={{ maxWidth: 820 }}>
        <div className="form-grid">
          <Field label="Request type" error={errors.request_type_id} className="full">
            <select className={`input ${errors.request_type_id ? 'err' : ''}`} value={form.request_type_id} onChange={(e) => set('request_type_id', e.target.value)} disabled={editing && existing?.current_cycle > 0}>
              <option value="">Select a type</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {type?.description && <span className="small muted">{type.description}</span>}
          </Field>
          <Field label="Title" error={errors.title} className="full">
            <input className={`input ${errors.title ? 'err' : ''}`} value={form.title} maxLength={200} onChange={(e) => set('title', e.target.value)} placeholder="Short summary of what you need" />
          </Field>
          {type?.requires_amount ? (
            <Field label="Amount (INR)" error={errors.amount}>
              <input className={`input ${errors.amount ? 'err' : ''}`} type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
              <span className="small muted">The amount decides which approval workflow is used.</span>
            </Field>
          ) : null}
          {type?.requires_dates ? (
            <>
              <Field label="Start date" error={errors.start_date}><input className={`input ${errors.start_date ? 'err' : ''}`} type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
              <Field label="End date" error={errors.end_date}><input className={`input ${errors.end_date ? 'err' : ''}`} type="date" min={form.start_date} value={form.end_date} onChange={(e) => set('end_date', e.target.value)} /></Field>
            </>
          ) : null}
          <Field label="Description" className="full">
            <textarea className="input" rows={4} maxLength={2000} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Add any details the approvers should know" />
          </Field>
          <div className="full">
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Supporting documents</div>
            {existing?.attachments?.map((a) => (
              <span key={a.id} className="file-pill"><Paperclip size={14} />{a.original_name}
                <button aria-label={`Remove ${a.original_name}`} onClick={() => removeAtt({ id, attId: a.id }).unwrap().catch((e) => toast.error(e.message))}><X size={14} /></button></span>
            ))}
            {files.map((f, i) => (
              <span key={i} className="file-pill"><Paperclip size={14} />{f.name}
                <button aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={14} /></button></span>
            ))}
            <div>
              <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt" onChange={(e) => { setFiles([...files, ...e.target.files].slice(0, 5)); e.target.value = ''; }} />
              <div className="small muted">PDF, images, Word, Excel or text. Up to 5 files, 5 MB each.</div>
              {errors.files && <span className="err-text">{errors.files}</span>}
            </div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 24, justifyContent: 'flex-end' }}>
          <button className="btn ghost" disabled={busy} onClick={() => navigate(-1)}>Cancel</button>
          <button className="btn ghost" disabled={busy} onClick={() => persist(false)}>Save draft</button>
          <button className="btn" disabled={busy} onClick={() => persist(true)}>{busy ? 'Working...' : existing?.current_cycle > 0 ? 'Resubmit for approval' : 'Submit for approval'}</button>
        </div>
      </div>
    </>
  );
}
