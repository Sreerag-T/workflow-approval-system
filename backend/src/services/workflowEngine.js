/**
 * Dynamic workflow execution engine.
 * Nothing about approval levels is hardcoded: steps, approvers, conditions and SLAs are all read from the
 * workflow version that was pinned to the request when it was submitted.
 *
 * Concurrency model: every state change runs in a transaction that first takes a row lock on the request
 * (SELECT ... FOR UPDATE). Concurrent approve/reject attempts therefore serialise, and the loser sees the
 * instance is no longer PENDING and gets HTTP 409. A conditional UPDATE (WHERE status='PENDING') is a second guard.
 */
const { HttpError } = require('../utils/errors');
const { audit, notify, notifyRole } = require('../utils/helpers');
const { selectWorkflow } = require('./conditions');
const { ROLES } = require('../middleware/auth');

async function superAdminRoleId(conn) {
  const [[r]] = await conn.query('SELECT id FROM roles WHERE name = ?', [ROLES.ADMIN]);
  return r.id;
}

async function loadCandidates(conn, typeId) {
  const [wfs] = await conn.query(
    'SELECT id, name, priority, current_version_id AS version_id FROM workflows WHERE request_type_id = ? AND is_active = 1 AND current_version_id IS NOT NULL',
    [typeId]
  );
  if (!wfs.length) return [];
  const [conds] = await conn.query('SELECT * FROM workflow_conditions WHERE version_id IN (?)', [wfs.map((w) => w.version_id)]);
  return wfs.map((w) => ({ ...w, conditions: conds.filter((c) => c.version_id === w.version_id) }));
}

async function resolveAssignee(conn, step, requesterId) {
  if (step.approver_type === 'USER') return { userId: step.approver_user_id, roleId: null };
  if (step.approver_type === 'ROLE') return { userId: null, roleId: step.approver_role_id };
  const [[u]] = await conn.query('SELECT manager_id FROM users WHERE id = ?', [requesterId]);
  if (u && u.manager_id) return { userId: u.manager_id, roleId: null };
  return { userId: null, roleId: await superAdminRoleId(conn) }; // no manager configured -> Super Admin
}

/** Moves the request forward to the next WAITING step (auto-skipping steps whose approver is the requester). */
async function activateFrom(conn, req, fromOrder) {
  let order = fromOrder;
  for (;;) {
    const [[inst]] = await conn.query(
      `SELECT ai.id, ai.step_order, ai.step_name, s.approver_type, s.approver_user_id, s.approver_role_id, s.escalation_hours
       FROM approval_instances ai JOIN workflow_steps s ON s.id = ai.step_id
       WHERE ai.request_id = ? AND ai.cycle_no = ? AND ai.step_order >= ? AND ai.status = 'WAITING'
       ORDER BY ai.step_order LIMIT 1`,
      [req.id, req.current_cycle, order]
    );
    if (!inst) {
      await conn.query("UPDATE requests SET status='APPROVED', current_step_order=NULL, completed_at=NOW() WHERE id=?", [req.id]);
      await notify(conn, req.requester_id, req.id, `Your request ${req.request_no} was fully approved`);
      await audit(conn, null, 'REQUEST_APPROVED', 'request', req.id, { cycle: req.current_cycle });
      return 'APPROVED';
    }
    const a = await resolveAssignee(conn, inst, req.requester_id);
    if (a.userId && a.userId === req.requester_id) {
      await conn.query("UPDATE approval_instances SET status='SKIPPED', acted_at=NOW() WHERE id=?", [inst.id]);
      await conn.query(
        "INSERT INTO approval_actions (request_id, approval_instance_id, cycle_no, actor_id, action, comments) VALUES (?,?,?,NULL,'SKIPPED',?)",
        [req.id, inst.id, req.current_cycle, 'Auto-skipped: approver is the requester']
      );
      order = inst.step_order + 1;
      continue;
    }
    const seconds = inst.escalation_hours ? Math.round(inst.escalation_hours * 3600) : null;
    await conn.query(
      `UPDATE approval_instances SET status='PENDING', assigned_user_id=?, assigned_role_id=?,
       due_at = ${seconds ? 'DATE_ADD(NOW(), INTERVAL ? SECOND)' : 'NULL'} WHERE id=?`,
      seconds ? [a.userId, a.roleId, seconds, inst.id] : [a.userId, a.roleId, inst.id]
    );
    await conn.query('UPDATE requests SET current_step_order=? WHERE id=?', [inst.step_order, req.id]);
    const msg = `${req.request_no} "${req.title}" needs your approval (${inst.step_name})`;
    if (a.userId) await notify(conn, a.userId, req.id, msg);
    else await notifyRole(conn, a.roleId, req.id, msg, req.requester_id);
    return 'PENDING';
  }
}

async function lockRequest(conn, id) {
  const [[req]] = await conn.query('SELECT * FROM requests WHERE id = ? FOR UPDATE', [id]);
  if (!req) throw new HttpError(404, 'Request not found');
  return req;
}

/** Submit a DRAFT, or re-submit after CHANGES_REQUESTED (starts a brand new approval cycle). */
async function submitRequest(conn, requestId, user, ip) {
  const req = await lockRequest(conn, requestId);
  if (req.requester_id !== user.id) throw new HttpError(403, 'Only the requester can submit this request');
  if (!['DRAFT', 'CHANGES_REQUESTED'].includes(req.status)) throw new HttpError(409, `A ${req.status.toLowerCase()} request cannot be submitted`);

  const [[type]] = await conn.query('SELECT * FROM request_types WHERE id = ?', [req.request_type_id]);
  if (!type.is_active) throw new HttpError(422, 'This request type is currently disabled');

  const wf = selectWorkflow(await loadCandidates(conn, req.request_type_id), req);
  if (!wf) throw new HttpError(422, 'No active workflow matches this request. Please contact the Super Admin.');
  const [steps] = await conn.query('SELECT * FROM workflow_steps WHERE version_id = ? ORDER BY step_order', [wf.version_id]);
  if (!steps.length) throw new HttpError(422, 'The matching workflow has no approval steps');

  const cycle = req.current_cycle + 1;
  for (const s of steps) {
    await conn.query(
      "INSERT INTO approval_instances (request_id, cycle_no, step_id, step_order, step_name, status) VALUES (?,?,?,?,?,'WAITING')",
      [req.id, cycle, s.id, s.step_order, s.name]
    );
  }
  await conn.query(
    "UPDATE requests SET status='PENDING', workflow_id=?, workflow_version_id=?, current_cycle=?, submitted_at=NOW(), completed_at=NULL WHERE id=?",
    [wf.id, wf.version_id, cycle, req.id]
  );
  const fresh = { ...req, current_cycle: cycle };
  await conn.query(
    "INSERT INTO approval_actions (request_id, cycle_no, actor_id, action, comments) VALUES (?,?,?,'SUBMITTED',?)",
    [req.id, cycle, user.id, cycle > 1 ? 'Re-submitted after requested changes' : null]
  );
  await audit(conn, user.id, 'REQUEST_SUBMITTED', 'request', req.id, { cycle, workflow: wf.name, version_id: wf.version_id }, ip);
  const status = await activateFrom(conn, fresh, 1);
  return { status, cycle, workflow: wf.name };
}

function canAct(inst, user) {
  return inst.assigned_user_id ? inst.assigned_user_id === user.id : inst.assigned_role_id === user.role_id;
}

/** Approve / reject / request changes on a pending approval instance. */
async function act(conn, instanceId, user, action, comments, ip) {
  const [[probe]] = await conn.query('SELECT request_id FROM approval_instances WHERE id = ?', [instanceId]);
  if (!probe) throw new HttpError(404, 'Approval task not found');
  const req = await lockRequest(conn, probe.request_id); // serialise concurrent actions on this request
  const [[inst]] = await conn.query('SELECT * FROM approval_instances WHERE id = ? FOR UPDATE', [instanceId]);

  if (inst.status !== 'PENDING' || req.status !== 'PENDING' || inst.cycle_no !== req.current_cycle)
    throw new HttpError(409, 'This approval has already been processed');
  if (!canAct(inst, user)) throw new HttpError(403, 'This request is not assigned to you');
  if (req.requester_id === user.id) throw new HttpError(403, 'You cannot act on your own request');

  const [upd] = await conn.query("UPDATE approval_instances SET status=?, acted_by=?, acted_at=NOW() WHERE id=? AND status='PENDING'", [action, user.id, inst.id]);
  if (upd.affectedRows !== 1) throw new HttpError(409, 'This approval has already been processed');
  await conn.query('INSERT INTO approval_actions (request_id, approval_instance_id, cycle_no, actor_id, action, comments) VALUES (?,?,?,?,?,?)', [
    req.id, inst.id, inst.cycle_no, user.id, action, comments || null,
  ]);
  await audit(conn, user.id, `APPROVAL_${action}`, 'request', req.id, { step: inst.step_name, cycle: inst.cycle_no, comments }, ip);

  if (action === 'APPROVED') {
    await notify(conn, req.requester_id, req.id, `${user.name} approved ${req.request_no} at "${inst.step_name}"`);
    return { status: await activateFrom(conn, req, inst.step_order + 1) };
  }
  // REJECTED stops the workflow; CHANGES_REQUESTED returns it to the employee
  await conn.query("UPDATE approval_instances SET status='CANCELLED' WHERE request_id=? AND cycle_no=? AND status='WAITING'", [req.id, inst.cycle_no]);
  const next = action === 'REJECTED' ? 'REJECTED' : 'CHANGES_REQUESTED';
  await conn.query('UPDATE requests SET status=?, current_step_order=NULL, completed_at=? WHERE id=?', [next, next === 'REJECTED' ? new Date() : null, req.id]);
  const verb = next === 'REJECTED' ? 'rejected' : 'requested changes on';
  await notify(conn, req.requester_id, req.id, `${user.name} ${verb} ${req.request_no}${comments ? `: ${comments}` : ''}`.slice(0, 250));
  return { status: next };
}

async function cancelRequest(conn, requestId, user, ip) {
  const req = await lockRequest(conn, requestId);
  if (req.requester_id !== user.id) throw new HttpError(403, 'Only the requester can cancel this request');
  if (!['DRAFT', 'PENDING', 'CHANGES_REQUESTED'].includes(req.status)) throw new HttpError(409, `A ${req.status.toLowerCase()} request cannot be cancelled`);
  await conn.query("UPDATE approval_instances SET status='CANCELLED' WHERE request_id=? AND cycle_no=? AND status IN ('WAITING','PENDING')", [req.id, req.current_cycle]);
  await conn.query("UPDATE requests SET status='CANCELLED', current_step_order=NULL, completed_at=NOW() WHERE id=?", [req.id]);
  if (req.current_cycle > 0)
    await conn.query("INSERT INTO approval_actions (request_id, cycle_no, actor_id, action) VALUES (?,?,?,'CANCELLED')", [req.id, req.current_cycle, user.id]);
  await audit(conn, user.id, 'REQUEST_CANCELLED', 'request', req.id, null, ip);
  return { status: 'CANCELLED' };
}

/** Escalates one overdue instance to the configured escalation user (or Super Admin). Safe to run concurrently. */
async function escalateOne(conn, instanceId) {
  const [[probe]] = await conn.query('SELECT request_id FROM approval_instances WHERE id = ?', [instanceId]);
  if (!probe) return false;
  const req = await lockRequest(conn, probe.request_id);
  const [[inst]] = await conn.query(
    `SELECT ai.*, s.escalate_to_user_id FROM approval_instances ai JOIN workflow_steps s ON s.id = ai.step_id WHERE ai.id = ? FOR UPDATE`,
    [instanceId]
  );
  if (inst.status !== 'PENDING' || inst.escalated || !inst.due_at || new Date(inst.due_at) > new Date()) return false;
  const toUser = inst.escalate_to_user_id || null;
  const toRole = toUser ? null : await superAdminRoleId(conn);
  await conn.query('UPDATE approval_instances SET assigned_user_id=?, assigned_role_id=?, escalated=1, escalated_at=NOW(), due_at=NULL WHERE id=?', [toUser, toRole, inst.id]);
  await conn.query("INSERT INTO approval_actions (request_id, approval_instance_id, cycle_no, actor_id, action, comments) VALUES (?,?,?,NULL,'ESCALATED',?)", [
    req.id, inst.id, inst.cycle_no, `SLA deadline passed at "${inst.step_name}" - escalated`,
  ]);
  const msg = `${req.request_no} "${req.title}" was escalated to you (${inst.step_name} overdue)`;
  if (toUser) await notify(conn, toUser, req.id, msg);
  else await notifyRole(conn, toRole, req.id, msg, req.requester_id);
  await notify(conn, req.requester_id, req.id, `${req.request_no} was escalated because the approval deadline passed`);
  await audit(conn, null, 'APPROVAL_ESCALATED', 'request', req.id, { step: inst.step_name });
  return true;
}

async function escalateOverdue(pool, withTx) {
  const [rows] = await pool.query("SELECT id FROM approval_instances WHERE status='PENDING' AND escalated=0 AND due_at IS NOT NULL AND due_at < NOW()");
  let count = 0;
  for (const r of rows) if (await withTx((conn) => escalateOne(conn, r.id))) count++;
  return count;
}

module.exports = { submitRequest, act, cancelRequest, escalateOverdue, canAct };
