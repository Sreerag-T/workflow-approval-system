const router = require('express').Router();
const { pool } = require('../config/db');
const { authenticate, authorize, ROLES } = require('../middleware/auth');

router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/approval-history', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT a.id, a.action, a.comments, a.cycle_no, a.created_at, ai.step_name, u.name AS actor_name,
            r.id AS request_id, r.request_no, r.title, rt.name AS type_name, ru.name AS requester_name
     FROM approval_actions a JOIN requests r ON r.id = a.request_id JOIN request_types rt ON rt.id = r.request_type_id
     JOIN users ru ON ru.id = r.requester_id LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN approval_instances ai ON ai.id = a.approval_instance_id
     ORDER BY a.id DESC LIMIT 300`);
  res.json(rows);
});

router.get('/audit-logs', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT l.id, l.action, l.entity_type, l.entity_id, l.details, l.ip_address, l.created_at, u.name AS user_name
     FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT 300`);
  res.json(rows);
});

module.exports = router;
