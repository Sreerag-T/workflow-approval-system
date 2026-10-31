const router = require('express').Router();
const { pool } = require('../config/db');
const { authenticate, ROLES } = require('../middleware/auth');

router.use(authenticate);

router.get('/', async (req, res) => {
  const admin = req.user.role === ROLES.ADMIN;
  const scope = admin ? '1=1' : 'r.requester_id = ?';
  const sp = admin ? [] : [req.user.id];

  const [[s]] = await pool.query(
    `SELECT COUNT(*) AS total, SUM(status='PENDING') AS pending, SUM(status='APPROVED') AS approved, SUM(status='REJECTED') AS rejected,
            SUM(status='DRAFT') AS drafts, SUM(status='CHANGES_REQUESTED') AS changes, SUM(status='CANCELLED') AS cancelled
     FROM requests r WHERE ${scope}`, sp);
  const stats = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Number(v || 0)]));

  const [byType] = await pool.query(
    `SELECT rt.name, COUNT(*) AS count FROM requests r JOIN request_types rt ON rt.id = r.request_type_id WHERE ${scope} GROUP BY rt.id, rt.name ORDER BY count DESC`, sp);
  const [monthly] = await pool.query(
    `SELECT DATE_FORMAT(r.created_at, '%b %Y') AS label, DATE_FORMAT(r.created_at, '%Y-%m') AS ym, COUNT(*) AS count
     FROM requests r WHERE ${scope} AND r.created_at >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH) GROUP BY ym, label ORDER BY ym`, sp);

  let myTasks = { count: 0, items: [] };
  if ([ROLES.ADMIN, ROLES.APPROVER].includes(req.user.role)) {
    const [items] = await pool.query(
      `SELECT ai.id AS instance_id, ai.step_name, ai.due_at, r.id AS request_id, r.request_no, r.title, r.amount, rt.name AS type_name, u.name AS requester_name
       FROM approval_instances ai JOIN requests r ON r.id = ai.request_id JOIN request_types rt ON rt.id = r.request_type_id JOIN users u ON u.id = r.requester_id
       WHERE ai.status='PENDING' AND r.status='PENDING' AND r.requester_id <> ? AND (ai.assigned_user_id = ? OR (ai.assigned_user_id IS NULL AND ai.assigned_role_id = ?))
       ORDER BY r.submitted_at LIMIT 50`,
      [req.user.id, req.user.id, req.user.role_id]);
    myTasks = { count: items.length, items: items.slice(0, 5) };
  }

  const [recent] = await pool.query(
    `SELECT a.id, a.action, a.comments, a.created_at, r.id AS request_id, r.request_no, r.title, u.name AS actor_name
     FROM approval_actions a JOIN requests r ON r.id = a.request_id LEFT JOIN users u ON u.id = a.actor_id
     ${admin ? '' : 'WHERE r.requester_id = ? OR a.actor_id = ?'} ORDER BY a.id DESC LIMIT 8`,
    admin ? [] : [req.user.id, req.user.id]);

  res.json({ stats, byType, monthly, myTasks, recent });
});

module.exports = router;
