import { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, History, Pencil, Plus, Timer, Trash2 } from 'lucide-react';
import {
  useCreateWorkflowMutation, useGetRolesQuery, useGetTypesQuery, useGetUsersQuery, useGetWorkflowVersionsQuery,
  useGetWorkflowsQuery, useRunEscalationMutation, useToggleWorkflowMutation, useUpdateWorkflowMutation,
} from '../api/apiSlice';
import { Empty, Field, MiniRail, Modal, PageHead, Spinner } from '../components/ui';
import { OPERATORS, FIELDS, describeApprover, describeCondition, fmtDateTime } from '../utils';

const newStep = () => ({ name: '', approver_type: 'MANAGER', approver_user_id: '', approver_role_id: '', escalation_hours: '', escalate_to_user_id: '' });
const blank = (typeId = '') => ({ request_type_id: typeId, name: '', description: '', priority: 0, is_active: true, conditions: [], steps: [newStep()] });
const num = (v) => (v === '' || v == null ? null : Number(v));

function toForm(w) {
  return {
    id: w.id, request_type_id: w.request_type_id, name: w.name, description: w.description || '', priority: w.priority, is_active: !!w.is_active,
    conditions: w.conditions.map((c) => ({ field: c.field, operator: c.operator, value: c.value, value2: c.value2 ?? '' })),
    steps: w.steps.map((s) => ({
      name: s.name, approver_type: s.approver_type, approver_user_id: s.approver_user_id || '', approver_role_id: s.approver_role_id || '',
      escalation_hours: s.escalation_hours ?? '', escalate_to_user_id: s.escalate_to_user_id || '',
    })),
  };
}

export default function Workflows() {
  const { data: workflows, isLoading } = useGetWorkflowsQuery();
  const [editing, setEditing] = useState(null);
  const [versionsOf, setVersionsOf] = useState(null);
  const [toggle] = useToggleWorkflowMutation();
  const [runEsc, { isLoading: escalating }] = useRunEscalationMutation();

  if (isLoading) return <Spinner />;
  const groups = {};
  workflows.forEach((w) => (groups[w.request_type_name] = [...(groups[w.request_type_name] || []), w]));

  return (
    <>
      <PageHead title="Approval workflows" subtitle="Define who approves what, in which order, under which conditions. Changes apply to new submissions only.">
        <button className="btn ghost" disabled={escalating} onClick={() => runEsc().unwrap().then((r) => toast.success(`${r.escalated} overdue approval(s) escalated`)).catch((e) => toast.error(e.message))}><Timer size={16} />Run escalation check</button>
        <button className="btn" onClick={() => setEditing(blank())}><Plus size={16} />New workflow</button>
      </PageHead>

      {!workflows.length && <div className="card"><Empty title="No workflows yet">Create one so employees can submit requests.</Empty></div>}
      <div className="stack" style={{ gap: 24 }}>
        {Object.entries(groups).map(([type, list]) => (
          <section key={type}>
            <h2 style={{ marginBottom: 10 }}>{type}</h2>
            <div className="stack" style={{ gap: 10 }}>
              {list.map((w) => (
                <div className="card" key={w.id} style={{ opacity: w.is_active ? 1 : 0.65 }}>
                  <div className="row between wrap">
                    <div className="row wrap"><h3 style={{ fontSize: 15 }}>{w.name}</h3>
                      <span className={`badge ${w.is_active ? 'on' : 'off'}`}>{w.is_active ? 'Active' : 'Inactive'}</span>
                      <span className="small muted">v{w.version_no} &middot; priority {w.priority}</span></div>
                    <div className="row">
                      <button className="btn ghost sm" onClick={() => setVersionsOf(w)}><History size={14} />Versions</button>
                      <button className="btn ghost sm" onClick={() => setEditing(toForm(w))}><Pencil size={14} />Edit</button>
                      <button className="btn ghost sm" onClick={() => toggle({ id: w.id, is_active: !w.is_active }).unwrap().then(() => toast.success(w.is_active ? 'Workflow deactivated' : 'Workflow activated')).catch((e) => toast.error(e.message))}>
                        {w.is_active ? 'Deactivate' : 'Activate'}</button>
                    </div>
                  </div>
                  <div style={{ margin: '12px 0 14px' }}>
                    {w.conditions.length ? w.conditions.map((c) => <span key={c.id} className="chip">{describeCondition(c)}</span>) : <span className="chip">Applies to every request</span>}
                  </div>
                  <MiniRail steps={w.steps} />
                  <div className="small muted" style={{ marginTop: 10 }}>{w.steps.map((s) => `${s.name}: ${describeApprover(s)}${s.escalation_hours ? ` (escalates after ${s.escalation_hours}h)` : ''}`).join('  |  ')}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      {editing && <Editor initial={editing} onClose={() => setEditing(null)} />}
      {versionsOf && <Versions workflow={versionsOf} onClose={() => setVersionsOf(null)} />}
    </>
  );
}

function Versions({ workflow, onClose }) {
  const { data } = useGetWorkflowVersionsQuery(workflow.id);
  return (
    <Modal title={`${workflow.name} - version history`} onClose={onClose} wide footer={<button className="btn ghost" onClick={onClose}>Close</button>}>
      {!data ? <Spinner /> : <div className="stack">
        {data.map((v) => (
          <div key={v.id} className="card" style={{ padding: 16 }}>
            <div className="row between wrap"><b>Version {v.version_no}{v.id === workflow.current_version_id ? ' (current)' : ''}</b>
              <span className="small muted">{fmtDateTime(v.created_at)} by {v.created_by_name || 'system'} &middot; {v.request_count} request{v.request_count === 1 ? '' : 's'} used it</span></div>
            <div style={{ margin: '8px 0' }}>{v.conditions.length ? v.conditions.map((c) => <span key={c.id} className="chip">{describeCondition(c)}</span>) : <span className="chip">Applies to every request</span>}</div>
            <MiniRail steps={v.steps} />
          </div>
        ))}
      </div>}
    </Modal>
  );
}

function Editor({ initial, onClose }) {
  const isEdit = Boolean(initial.id);
  const { data: types } = useGetTypesQuery();
  const { data: users } = useGetUsersQuery();
  const { data: roles } = useGetRolesQuery();
  const [create, { isLoading: c1 }] = useCreateWorkflowMutation();
  const [update, { isLoading: c2 }] = useUpdateWorkflowMutation();
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState({});

  const type = types?.find((t) => t.id === Number(f.request_type_id));
  const approvers = (users || []).filter((u) => u.is_active && u.role !== 'Employee');
  const approverRoles = (roles || []).filter((r) => r.name !== 'Employee');
  const fieldOptions = Object.keys(FIELDS).filter((k) => (k === 'amount' ? type?.requires_amount : type?.requires_dates));

  const setStep = (i, patch) => setF({ ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const setCond = (i, patch) => setF({ ...f, conditions: f.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const move = (i, d) => {
    const steps = [...f.steps];
    [steps[i], steps[i + d]] = [steps[i + d], steps[i]];
    setF({ ...f, steps });
  };

  const save = async () => {
    const e = {};
    if (!f.request_type_id) e.type = 'Choose a request type';
    if (f.name.trim().length < 2) e.name = 'Give the workflow a name';
    f.conditions.forEach((c, i) => {
      if (c.value === '' || Number.isNaN(Number(c.value))) e[`c${i}`] = 'Enter a value';
      else if (c.operator === 'between' && (c.value2 === '' || Number(c.value2) < Number(c.value))) e[`c${i}`] = 'Upper value must be >= lower value';
    });
    f.steps.forEach((s, i) => {
      if (!s.name.trim()) e[`s${i}`] = 'Name this step';
      else if (s.approver_type === 'USER' && !s.approver_user_id) e[`s${i}`] = 'Choose an approver';
      else if (s.approver_type === 'ROLE' && !s.approver_role_id) e[`s${i}`] = 'Choose a role';
    });
    setErrors(e);
    if (Object.keys(e).length) return;
    const payload = {
      request_type_id: Number(f.request_type_id), name: f.name.trim(), description: f.description || null, priority: Number(f.priority) || 0, is_active: f.is_active,
      conditions: f.conditions.map((c) => ({ field: c.field, operator: c.operator, value: Number(c.value), value2: c.operator === 'between' ? Number(c.value2) : null })),
      steps: f.steps.map((s) => ({
        name: s.name.trim(), approver_type: s.approver_type,
        approver_user_id: s.approver_type === 'USER' ? Number(s.approver_user_id) : null,
        approver_role_id: s.approver_type === 'ROLE' ? Number(s.approver_role_id) : null,
        escalation_hours: num(s.escalation_hours), escalate_to_user_id: num(s.escalate_to_user_id),
      })),
    };
    try {
      const out = isEdit ? await update({ id: f.id, ...payload }).unwrap() : await create(payload).unwrap();
      toast.success(isEdit ? `Saved as version ${out.versionNo}. Existing requests are unaffected.` : 'Workflow created');
      onClose();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <Modal title={isEdit ? 'Edit workflow' : 'New workflow'} wide onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>Cancel</button>
      <button className="btn" disabled={c1 || c2} onClick={save}>{isEdit ? 'Save as new version' : 'Create workflow'}</button></>}>
      {!types ? <Spinner /> : (
        <div className="stack" style={{ gap: 22 }}>
          <div className="form-grid">
            <Field label="Request type" error={errors.type}>
              <select className="input" value={f.request_type_id} onChange={(e) => setF({ ...f, request_type_id: e.target.value, conditions: [] })}>
                <option value="">Select a type</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Workflow name" error={errors.name}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Purchase above 30,000" /></Field>
            <Field label="Priority"><input className="input" type="number" min="0" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} />
              <span className="small muted">When several workflows match, the highest priority wins.</span></Field>
            <label className="check" style={{ alignSelf: 'center' }}><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />Active</label>
          </div>

          <div>
            <div className="row between" style={{ marginBottom: 8 }}><h3>When does this workflow apply?</h3>
              <button className="btn ghost sm" disabled={!fieldOptions.length || f.conditions.length >= 5} onClick={() => setF({ ...f, conditions: [...f.conditions, { field: fieldOptions[0], operator: 'gte', value: '', value2: '' }] })}><Plus size={14} />Add condition</button></div>
            {!f.conditions.length && <p className="muted small" style={{ margin: 0 }}>{type && !fieldOptions.length ? 'This request type has no amount or dates, so the workflow applies to every request.' : 'No conditions: applies to every request of this type. All conditions you add must match (AND).'}</p>}
            {f.conditions.map((c, i) => (
              <div key={i} className="row wrap" style={{ marginBottom: 8 }}>
                <select className="input" style={{ width: 130 }} value={c.field} onChange={(e) => setCond(i, { field: e.target.value })}>{fieldOptions.map((k) => <option key={k} value={k}>{FIELDS[k]}</option>)}</select>
                <select className="input" style={{ width: 130 }} value={c.operator} onChange={(e) => setCond(i, { operator: e.target.value })}>{Object.entries(OPERATORS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <input className="input" style={{ width: 130 }} type="number" placeholder="Value" value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} />
                {c.operator === 'between' && <><span>and</span><input className="input" style={{ width: 130 }} type="number" placeholder="Upper" value={c.value2} onChange={(e) => setCond(i, { value2: e.target.value })} /></>}
                <button className="icon-btn" aria-label="Remove condition" onClick={() => setF({ ...f, conditions: f.conditions.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>
                {errors[`c${i}`] && <span className="err-text">{errors[`c${i}`]}</span>}
              </div>
            ))}
          </div>

          <div>
            <div className="row between" style={{ marginBottom: 8 }}><h3>Approval sequence</h3>
              <button className="btn ghost sm" disabled={f.steps.length >= 10} onClick={() => setF({ ...f, steps: [...f.steps, newStep()] })}><Plus size={14} />Add level</button></div>
            <div className="stack" style={{ gap: 10 }}>
              {f.steps.map((s, i) => (
                <div key={i} className="step-edit">
                  <div className="row wrap">
                    <span className="no">{i + 1}</span>
                    <input className="input grow" style={{ minWidth: 140 }} placeholder="Level name, e.g. Finance" value={s.name} onChange={(e) => setStep(i, { name: e.target.value })} />
                    <select className="input" style={{ width: 190 }} value={s.approver_type} onChange={(e) => setStep(i, { approver_type: e.target.value })}>
                      <option value="MANAGER">Requester's manager</option><option value="USER">Specific person</option><option value="ROLE">Anyone with a role</option></select>
                    {s.approver_type === 'USER' && <select className="input" style={{ width: 200 }} value={s.approver_user_id} onChange={(e) => setStep(i, { approver_user_id: e.target.value })}>
                      <option value="">Choose approver</option>{approvers.map((u) => <option key={u.id} value={u.id}>{u.name}{u.designation ? ` (${u.designation})` : ''}</option>)}</select>}
                    {s.approver_type === 'ROLE' && <select className="input" style={{ width: 200 }} value={s.approver_role_id} onChange={(e) => setStep(i, { approver_role_id: e.target.value })}>
                      <option value="">Choose role</option>{approverRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
                    <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></button>
                    <button className="icon-btn" aria-label="Move down" disabled={i === f.steps.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></button>
                    <button className="icon-btn" aria-label="Remove level" disabled={f.steps.length === 1} onClick={() => setF({ ...f, steps: f.steps.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>
                  </div>
                  <div className="row wrap" style={{ marginTop: 10, paddingLeft: 36 }}>
                    <span className="small muted">Escalate if not actioned within</span>
                    <input className="input" style={{ width: 90 }} type="number" min="0" step="0.5" placeholder="hours" value={s.escalation_hours} onChange={(e) => setStep(i, { escalation_hours: e.target.value })} />
                    <span className="small muted">hours, to</span>
                    <select className="input" style={{ width: 190 }} value={s.escalate_to_user_id} onChange={(e) => setStep(i, { escalate_to_user_id: e.target.value })}>
                      <option value="">Any Super Admin</option>{approvers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                  </div>
                  {errors[`s${i}`] && <div className="err-text" style={{ marginTop: 6, paddingLeft: 36 }}>{errors[`s${i}`]}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
