// Admin-side workflow configuration: creating immutable versions + reading them back
const { audit } = require('../utils/helpers');

/** Creates a new version (conditions + ordered steps) and makes it the workflow's current one. Old versions stay untouched. */
async function saveVersion(conn, workflowId, { conditions = [], steps }, userId) {
  const [[{ next }]] = await conn.query('SELECT COALESCE(MAX(version_no),0)+1 AS next FROM workflow_versions WHERE workflow_id = ?', [workflowId]);
  const [v] = await conn.query('INSERT INTO workflow_versions (workflow_id, version_no, created_by) VALUES (?,?,?)', [workflowId, next, userId || null]);
  for (const c of conditions) {
    await conn.query('INSERT INTO workflow_conditions (version_id, field, operator, value, value2) VALUES (?,?,?,?,?)', [
      v.insertId, c.field, c.operator, c.value, c.operator === 'between' ? c.value2 : null,
    ]);
  }
  let order = 1;
  for (const s of steps) {
    await conn.query(
      `INSERT INTO workflow_steps (version_id, step_order, name, approver_type, approver_user_id, approver_role_id, escalation_hours, escalate_to_user_id)
       VALUES (?,?,?,?,?,?,?,?)`,
      [v.insertId, order++, s.name, s.approver_type, s.approver_type === 'USER' ? s.approver_user_id : null,
        s.approver_type === 'ROLE' ? s.approver_role_id : null, s.escalation_hours || null, s.escalate_to_user_id || null]
    );
  }
  await conn.query('UPDATE workflows SET current_version_id = ? WHERE id = ?', [v.insertId, workflowId]);
  return { versionId: v.insertId, versionNo: next };
}

async function createWorkflow(conn, body, userId, ip) {
  const [w] = await conn.query(
    'INSERT INTO workflows (request_type_id, name, description, priority, is_active, created_by) VALUES (?,?,?,?,?,?)',
    [body.request_type_id, body.name, body.description || null, body.priority || 0, body.is_active === false ? 0 : 1, userId || null]
  );
  const ver = await saveVersion(conn, w.insertId, body, userId);
  await audit(conn, userId, 'WORKFLOW_CREATED', 'workflow', w.insertId, { name: body.name, version: ver.versionNo }, ip);
  return { id: w.insertId, ...ver };
}

/** Loads conditions + steps (with approver names) for a list of version ids, grouped by version. */
async function loadVersionDetails(conn, versionIds) {
  const map = {};
  versionIds.forEach((id) => (map[id] = { conditions: [], steps: [] }));
  if (!versionIds.length) return map;
  const [conds] = await conn.query('SELECT * FROM workflow_conditions WHERE version_id IN (?) ORDER BY id', [versionIds]);
  conds.forEach((c) => map[c.version_id].conditions.push(c));
  const [steps] = await conn.query(
    `SELECT s.*, u.name AS approver_user_name, r.name AS approver_role_name, eu.name AS escalate_to_name
     FROM workflow_steps s
     LEFT JOIN users u ON u.id = s.approver_user_id
     LEFT JOIN roles r ON r.id = s.approver_role_id
     LEFT JOIN users eu ON eu.id = s.escalate_to_user_id
     WHERE s.version_id IN (?) ORDER BY s.step_order`,
    [versionIds]
  );
  steps.forEach((s) => map[s.version_id].steps.push(s));
  return map;
}

module.exports = { saveVersion, createWorkflow, loadVersionDetails };
