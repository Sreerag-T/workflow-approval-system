const router = require('express').Router();
const { z } = require('zod');
const { pool, withTx } = require('../config/db');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const engine = require('../services/workflowEngine');

router.use(authenticate, authorize(ROLES.APPROVER, ROLES.ADMIN));

const actionSchema = z
  .object({
    action: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']),
    comments: z.string().trim().max(1000).optional(),
  })
  .refine((b) => b.action === 'APPROVED' || (b.comments && b.comments.length >= 3), { message: 'Comments are required when rejecting or requesting changes', path: ['comments'] });

router.get('/pending', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT ai.id AS instance_id, ai.step_name, ai.step_order, ai.due_at, ai.escalated, ai.created_at AS assigned_at,
            r.id AS request_id, r.request_no, r.title, r.amount, r.days, r.submitted_at, r.current_cycle,
            rt.name AS type_name, u.name AS requester_name
     FROM approval_instances ai JOIN requests r ON r.id = ai.request_id
     JOIN request_types rt ON rt.id = r.request_type_id JOIN users u ON u.id = r.requester_id
     WHERE ai.status = 'PENDING' AND r.status = 'PENDING' AND r.requester_id <> ?
       AND (ai.assigned_user_id = ? OR (ai.assigned_user_id IS NULL AND ai.assigned_role_id = ?))
     ORDER BY ai.due_at IS NULL, ai.due_at, r.submitted_at`,
    [req.user.id, req.user.id, req.user.role_id]
  );
  res.json(rows);
});

router.get('/history', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT a.id, a.action, a.comments, a.created_at, a.cycle_no, ai.step_name,
            r.id AS request_id, r.request_no, r.title, r.status AS request_status, rt.name AS type_name, u.name AS requester_name
     FROM approval_actions a JOIN requests r ON r.id = a.request_id JOIN request_types rt ON rt.id = r.request_type_id
     JOIN users u ON u.id = r.requester_id LEFT JOIN approval_instances ai ON ai.id = a.approval_instance_id
     WHERE a.actor_id = ? AND a.action IN ('APPROVED','REJECTED','CHANGES_REQUESTED') ORDER BY a.created_at DESC, a.id DESC LIMIT 200`,
    [req.user.id]
  );
  res.json(rows);
});

router.post('/:id/action', validate(actionSchema), async (req, res) => {
  const out = await withTx((conn) => engine.act(conn, Number(req.params.id), req.user, req.body.action, req.body.comments, req.ip));
  res.json(out);
});

// Lets the Super Admin trigger the SLA escalation job on demand (it also runs on a timer)
router.post('/escalate-now', authorize(ROLES.ADMIN), async (req, res) => {
  const escalated = await engine.escalateOverdue(pool, withTx);
  res.json({ escalated });
});

module.exports = router;
