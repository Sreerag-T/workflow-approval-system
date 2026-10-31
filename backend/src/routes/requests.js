const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { pool, withTx } = require('../config/db');
const { authenticate, ROLES } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { upload, uploadDir } = require('../middleware/upload');
const { HttpError } = require('../utils/errors');
const { audit } = require('../utils/helpers');
const engine = require('../services/workflowEngine');

router.use(authenticate);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable().optional();
const bodySchema = z.object({
  request_type_id: z.number().int(),
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().max(2000).nullable().optional(),
  amount: z.number().positive('Amount must be greater than 0').max(1e9).nullable().optional(),
  start_date: dateStr,
  end_date: dateStr,
});

const EDITABLE = ['DRAFT', 'CHANGES_REQUESTED'];

/** Applies the request type's rules (amount / dates required) and derives the number of days. */
async function normalise(b) {
  const [[type]] = await pool.query('SELECT * FROM request_types WHERE id = ?', [b.request_type_id]);
  if (!type) throw new HttpError(422, 'Unknown request type');
  if (!type.is_active) throw new HttpError(422, 'This request type is disabled');
  const out = { amount: null, start_date: null, end_date: null, days: null };
  if (type.requires_amount) {
    if (!b.amount) throw new HttpError(422, 'amount: Amount is required for this request type');
    out.amount = b.amount;
  }
  if (type.requires_dates) {
    if (!b.start_date || !b.end_date) throw new HttpError(422, 'start_date: Start and end dates are required for this request type');
    const s = new Date(b.start_date), e = new Date(b.end_date);
    if (e < s) throw new HttpError(422, 'end_date: End date cannot be before start date');
    out.start_date = b.start_date;
    out.end_date = b.end_date;
    out.days = Math.round((e - s) / 86400000) + 1;
  }
  return out;
}

async function getRequestOr404(id) {
  const [[r]] = await pool.query('SELECT * FROM requests WHERE id = ?', [id]);
  if (!r) throw new HttpError(404, 'Request not found');
  return r;
}

async function canView(user, r) {
  if (user.role === ROLES.ADMIN || r.requester_id === user.id) return true;
  const [rows] = await pool.query(
    `(SELECT 1 FROM approval_instances WHERE request_id = ? AND (assigned_user_id = ? OR (assigned_user_id IS NULL AND assigned_role_id = ?)))
     UNION (SELECT 1 FROM approval_actions WHERE request_id = ? AND actor_id = ?) LIMIT 1`,
    [r.id, user.id, user.role_id, r.id, user.id]
  );
  return rows.length > 0;
}

const requireOwnerEditable = (user, r) => {
  if (r.requester_id !== user.id) throw new HttpError(403, 'Only the requester can modify this request');
  if (!EDITABLE.includes(r.status)) throw new HttpError(409, `A ${r.status.toLowerCase()} request can no longer be edited`);
};

router.get('/', async (req, res) => {
  const { status, type, q, mine } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 10);
  const where = [];
  const params = [];
  if (req.user.role !== ROLES.ADMIN || mine === '1') { where.push('r.requester_id = ?'); params.push(req.user.id); }
  if (status) { where.push('r.status = ?'); params.push(status); }
  if (type) { where.push('r.request_type_id = ?'); params.push(Number(type)); }
  if (q) { where.push('(r.title LIKE ? OR r.request_no LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM requests r ${w}`, params);
  const [rows] = await pool.query(
    `SELECT r.id, r.request_no, r.title, r.amount, r.days, r.status, r.current_step_order, r.created_at, r.submitted_at,
            rt.name AS type_name, rt.code AS type_code, u.name AS requester_name
     FROM requests r JOIN request_types rt ON rt.id = r.request_type_id JOIN users u ON u.id = r.requester_id
     ${w} ORDER BY r.updated_at DESC, r.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );
  res.json({ data: rows, total, page, limit });
});

router.post('/', validate(bodySchema), async (req, res) => {
  const b = req.body;
  const n = await normalise(b);
  const id = await withTx(async (conn) => {
    const [r] = await conn.query(
      'INSERT INTO requests (request_type_id, requester_id, title, description, amount, start_date, end_date, days) VALUES (?,?,?,?,?,?,?,?)',
      [b.request_type_id, req.user.id, b.title, b.description || null, n.amount, n.start_date, n.end_date, n.days]
    );
    await conn.query("UPDATE requests SET request_no = CONCAT('REQ-', LPAD(id, 5, '0')) WHERE id = ?", [r.insertId]);
    await audit(conn, req.user.id, 'REQUEST_CREATED', 'request', r.insertId, { title: b.title }, req.ip);
    return r.insertId;
  });
  res.status(201).json({ id });
});

router.get('/:id', async (req, res) => {
  const r = await getRequestOr404(req.params.id);
  if (!(await canView(req.user, r))) throw new HttpError(403, 'You do not have access to this request');
  const [[detail]] = await pool.query(
    `SELECT r.*, rt.name AS type_name, rt.code AS type_code, rt.requires_amount, rt.requires_dates, u.name AS requester_name, u.email AS requester_email,
            w.name AS workflow_name, v.version_no AS workflow_version
     FROM requests r JOIN request_types rt ON rt.id = r.request_type_id JOIN users u ON u.id = r.requester_id
     LEFT JOIN workflows w ON w.id = r.workflow_id LEFT JOIN workflow_versions v ON v.id = r.workflow_version_id WHERE r.id = ?`,
    [r.id]
  );
  const [instances] = await pool.query(
    `SELECT ai.*, au.name AS assigned_user_name, ro.name AS assigned_role_name, ab.name AS acted_by_name
     FROM approval_instances ai LEFT JOIN users au ON au.id = ai.assigned_user_id LEFT JOIN roles ro ON ro.id = ai.assigned_role_id
     LEFT JOIN users ab ON ab.id = ai.acted_by WHERE ai.request_id = ? ORDER BY ai.cycle_no, ai.step_order`,
    [r.id]
  );
  const [history] = await pool.query(
    `SELECT a.*, u.name AS actor_name, ai.step_name FROM approval_actions a LEFT JOIN users u ON u.id = a.actor_id
     LEFT JOIN approval_instances ai ON ai.id = a.approval_instance_id WHERE a.request_id = ? ORDER BY a.id`,
    [r.id]
  );
  const [attachments] = await pool.query('SELECT id, original_name, mime_type, size, created_at FROM request_attachments WHERE request_id = ?', [r.id]);
  const mine = r.requester_id === req.user.id;
  const actionable = instances.find((i) => i.status === 'PENDING' && i.cycle_no === r.current_cycle && engine.canAct(i, req.user) && !mine);
  res.json({
    ...detail, instances, history, attachments,
    permissions: {
      canEdit: mine && EDITABLE.includes(r.status),
      canSubmit: mine && EDITABLE.includes(r.status),
      canCancel: mine && ['DRAFT', 'PENDING', 'CHANGES_REQUESTED'].includes(r.status),
      pendingInstanceId: actionable ? actionable.id : null,
    },
  });
});

router.put('/:id', validate(bodySchema), async (req, res) => {
  const r = await getRequestOr404(req.params.id);
  requireOwnerEditable(req.user, r);
  const b = req.body;
  const n = await normalise(b);
  await pool.query('UPDATE requests SET request_type_id=?, title=?, description=?, amount=?, start_date=?, end_date=?, days=? WHERE id=?', [
    b.request_type_id, b.title, b.description || null, n.amount, n.start_date, n.end_date, n.days, r.id,
  ]);
  await audit(pool, req.user.id, 'REQUEST_UPDATED', 'request', r.id, { title: b.title }, req.ip);
  res.json({ message: 'Request updated' });
});

router.post('/:id/submit', async (req, res) => {
  const out = await withTx((conn) => engine.submitRequest(conn, Number(req.params.id), req.user, req.ip));
  res.json(out);
});

router.post('/:id/cancel', async (req, res) => {
  const out = await withTx((conn) => engine.cancelRequest(conn, Number(req.params.id), req.user, req.ip));
  res.json(out);
});

router.post('/:id/attachments', upload.array('files', 5), async (req, res) => {
  const files = req.files || [];
  const cleanup = () => files.forEach((f) => fs.unlink(f.path, () => {}));
  try {
    const r = await getRequestOr404(req.params.id);
    requireOwnerEditable(req.user, r);
    if (!files.length) throw new HttpError(422, 'Choose at least one file');
    for (const f of files) {
      await pool.query('INSERT INTO request_attachments (request_id, original_name, stored_name, mime_type, size, uploaded_by) VALUES (?,?,?,?,?,?)', [
        r.id, f.originalname, f.filename, f.mimetype, f.size, req.user.id,
      ]);
    }
    await audit(pool, req.user.id, 'ATTACHMENT_ADDED', 'request', r.id, { files: files.map((f) => f.originalname) }, req.ip);
    res.status(201).json({ message: `${files.length} file(s) uploaded` });
  } catch (e) {
    cleanup();
    throw e;
  }
});

router.delete('/:id/attachments/:attId', async (req, res) => {
  const r = await getRequestOr404(req.params.id);
  requireOwnerEditable(req.user, r);
  const [[a]] = await pool.query('SELECT * FROM request_attachments WHERE id = ? AND request_id = ?', [req.params.attId, r.id]);
  if (!a) throw new HttpError(404, 'Attachment not found');
  await pool.query('DELETE FROM request_attachments WHERE id = ?', [a.id]);
  fs.unlink(path.join(uploadDir, a.stored_name), () => {});
  res.json({ message: 'Attachment removed' });
});

router.get('/:id/attachments/:attId/download', async (req, res) => {
  const r = await getRequestOr404(req.params.id);
  if (!(await canView(req.user, r))) throw new HttpError(403, 'You do not have access to this request');
  const [[a]] = await pool.query('SELECT * FROM request_attachments WHERE id = ? AND request_id = ?', [req.params.attId, r.id]);
  if (!a) throw new HttpError(404, 'Attachment not found');
  res.download(path.join(uploadDir, a.stored_name), a.original_name);
});

module.exports = router;
