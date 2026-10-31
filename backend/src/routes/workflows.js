const router = require('express').Router();
const { z } = require('zod');
const { pool, withTx } = require('../config/db');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { HttpError } = require('../utils/errors');
const { audit } = require('../utils/helpers');
const { saveVersion, createWorkflow, loadVersionDetails } = require('../services/workflowConfig');

router.use(authenticate, authorize(ROLES.ADMIN));

const stepSchema = z
  .object({
    name: z.string().trim().min(1, 'Step name is required').max(100),
    approver_type: z.enum(['USER', 'ROLE', 'MANAGER']),
    approver_user_id: z.number().int().nullable().optional(),
    approver_role_id: z.number().int().nullable().optional(),
    escalation_hours: z.number().positive().max(9999).nullable().optional(),
    escalate_to_user_id: z.number().int().nullable().optional(),
  })
  .superRefine((s, ctx) => {
    if (s.approver_type === 'USER' && !s.approver_user_id) ctx.addIssue({ code: 'custom', path: ['approver_user_id'], message: 'Choose an approver' });
    if (s.approver_type === 'ROLE' && !s.approver_role_id) ctx.addIssue({ code: 'custom', path: ['approver_role_id'], message: 'Choose a role' });
  });

const conditionSchema = z
  .object({
    field: z.enum(['amount', 'days']),
    operator: z.enum(['eq', 'gt', 'gte', 'lt', 'lte', 'between']),
    value: z.number(),
    value2: z.number().nullable().optional(),
  })
  .refine((c) => c.operator !== 'between' || (c.value2 != null && c.value2 >= c.value), { message: 'Between needs an upper value >= the lower value', path: ['value2'] });

const workflowSchema = z.object({
  request_type_id: z.number().int(),
  name: z.string().trim().min(2, 'Workflow name is required').max(150),
  description: z.string().max(255).nullable().optional(),
  priority: z.number().int().min(0).max(1000).default(0),
  is_active: z.boolean().default(true),
  conditions: z.array(conditionSchema).max(5).default([]),
  steps: z.array(stepSchema).min(1, 'Add at least one approval step').max(10),
});

router.get('/', async (req, res) => {
  const [wfs] = await pool.query(
    `SELECT w.*, rt.name AS request_type_name, rt.code AS request_type_code, v.version_no
     FROM workflows w JOIN request_types rt ON rt.id = w.request_type_id LEFT JOIN workflow_versions v ON v.id = w.current_version_id
     ORDER BY rt.id, w.priority DESC, w.id`
  );
  const details = await loadVersionDetails(pool, wfs.map((w) => w.current_version_id).filter(Boolean));
  res.json(wfs.map((w) => ({ ...w, ...(details[w.current_version_id] || { conditions: [], steps: [] }) })));
});

router.get('/:id/versions', async (req, res) => {
  const [vs] = await pool.query(
    `SELECT v.*, u.name AS created_by_name, (SELECT COUNT(*) FROM requests r WHERE r.workflow_version_id = v.id) AS request_count
     FROM workflow_versions v LEFT JOIN users u ON u.id = v.created_by WHERE v.workflow_id = ? ORDER BY v.version_no DESC`,
    [req.params.id]
  );
  const details = await loadVersionDetails(pool, vs.map((v) => v.id));
  res.json(vs.map((v) => ({ ...v, ...details[v.id] })));
});

router.post('/', validate(workflowSchema), async (req, res) => {
  const out = await withTx((conn) => createWorkflow(conn, req.body, req.user.id, req.ip));
  res.status(201).json(out);
});

/** Editing never mutates old data: it creates version N+1. Requests already submitted keep their old version. */
router.put('/:id', validate(workflowSchema), async (req, res) => {
  const id = Number(req.params.id);
  const out = await withTx(async (conn) => {
    const [[w]] = await conn.query('SELECT id FROM workflows WHERE id = ? FOR UPDATE', [id]);
    if (!w) throw new HttpError(404, 'Workflow not found');
    const b = req.body;
    await conn.query('UPDATE workflows SET request_type_id=?, name=?, description=?, priority=?, is_active=? WHERE id=?', [
      b.request_type_id, b.name, b.description || null, b.priority, b.is_active ? 1 : 0, id,
    ]);
    const ver = await saveVersion(conn, id, b, req.user.id);
    await audit(conn, req.user.id, 'WORKFLOW_VERSIONED', 'workflow', id, { version: ver.versionNo }, req.ip);
    return ver;
  });
  res.json(out);
});

router.patch('/:id/status', validate(z.object({ is_active: z.boolean() })), async (req, res) => {
  const [r] = await pool.query('UPDATE workflows SET is_active = ? WHERE id = ?', [req.body.is_active ? 1 : 0, req.params.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Workflow not found');
  await audit(pool, req.user.id, req.body.is_active ? 'WORKFLOW_ACTIVATED' : 'WORKFLOW_DEACTIVATED', 'workflow', Number(req.params.id), null, req.ip);
  res.json({ message: 'Workflow status updated' });
});

module.exports = router;
