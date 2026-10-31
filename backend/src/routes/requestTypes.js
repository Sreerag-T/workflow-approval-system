const router = require('express').Router();
const { z } = require('zod');
const { pool } = require('../config/db');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { HttpError } = require('../utils/errors');
const { audit } = require('../utils/helpers');

router.use(authenticate);

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(100),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,30}$/, 'Code: 2-30 letters, digits or underscore'),
  description: z.string().max(255).nullable().optional(),
  requires_amount: z.boolean().default(false),
  requires_dates: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

router.get('/', async (req, res) => {
  const all = req.user.role === ROLES.ADMIN;
  const [rows] = await pool.query(`SELECT * FROM request_types ${all ? '' : 'WHERE is_active = 1'} ORDER BY id`);
  res.json(rows);
});

router.post('/', authorize(ROLES.ADMIN), validate(schema), async (req, res) => {
  const b = req.body;
  const [r] = await pool.query('INSERT INTO request_types (name, code, description, requires_amount, requires_dates, is_active) VALUES (?,?,?,?,?,?)', [
    b.name, b.code, b.description || null, b.requires_amount, b.requires_dates, b.is_active,
  ]);
  await audit(pool, req.user.id, 'REQUEST_TYPE_CREATED', 'request_type', r.insertId, { code: b.code }, req.ip);
  res.status(201).json({ id: r.insertId });
});

router.put('/:id', authorize(ROLES.ADMIN), validate(schema), async (req, res) => {
  const b = req.body;
  const [r] = await pool.query('UPDATE request_types SET name=?, code=?, description=?, requires_amount=?, requires_dates=?, is_active=? WHERE id=?', [
    b.name, b.code, b.description || null, b.requires_amount, b.requires_dates, b.is_active, req.params.id,
  ]);
  if (!r.affectedRows) throw new HttpError(404, 'Request type not found');
  await audit(pool, req.user.id, 'REQUEST_TYPE_UPDATED', 'request_type', Number(req.params.id), { is_active: b.is_active }, req.ip);
  res.json({ message: 'Request type updated' });
});

module.exports = router;
