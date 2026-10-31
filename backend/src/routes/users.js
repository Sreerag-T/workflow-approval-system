const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { pool } = require('../config/db');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { HttpError } = require('../utils/errors');
const { audit } = require('../utils/helpers');

router.use(authenticate, authorize(ROLES.ADMIN));

const base = {
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().email('Enter a valid email'),
  role_id: z.number().int(),
  manager_id: z.number().int().nullable().optional(),
  designation: z.string().max(100).nullable().optional(),
};
const createSchema = z.object({ ...base, password: z.string().min(8, 'Password must be at least 8 characters') });
const updateSchema = z.object({ ...base, is_active: z.boolean().optional(), password: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal('')) });

router.get('/roles', async (req, res) => {
  const [rows] = await pool.query('SELECT id, name FROM roles ORDER BY id');
  res.json(rows);
});

router.get('/', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.designation, u.is_active, u.role_id, r.name AS role, u.manager_id, m.name AS manager_name, u.created_at
     FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN users m ON m.id = u.manager_id ORDER BY u.id`
  );
  res.json(rows);
});

router.post('/', validate(createSchema), async (req, res) => {
  const b = req.body;
  const hash = await bcrypt.hash(b.password, 10);
  const [r] = await pool.query('INSERT INTO users (name, email, password_hash, role_id, manager_id, designation) VALUES (?,?,?,?,?,?)', [
    b.name, b.email.toLowerCase(), hash, b.role_id, b.manager_id || null, b.designation || null,
  ]);
  await audit(pool, req.user.id, 'USER_CREATED', 'user', r.insertId, { email: b.email, role_id: b.role_id }, req.ip);
  res.status(201).json({ id: r.insertId });
});

router.put('/:id', validate(updateSchema), async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body;
  if (b.manager_id === id) throw new HttpError(422, 'A user cannot be their own manager');
  if (id === req.user.id && b.is_active === false) throw new HttpError(422, 'You cannot deactivate your own account');
  const [r] = await pool.query(
    'UPDATE users SET name=?, email=?, role_id=?, manager_id=?, designation=?, is_active=COALESCE(?, is_active) WHERE id=?',
    [b.name, b.email.toLowerCase(), b.role_id, b.manager_id || null, b.designation || null, b.is_active === undefined ? null : b.is_active ? 1 : 0, id]
  );
  if (!r.affectedRows) throw new HttpError(404, 'User not found');
  if (b.password) await pool.query('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(b.password, 10), id]);
  await audit(pool, req.user.id, 'USER_UPDATED', 'user', id, { role_id: b.role_id, is_active: b.is_active }, req.ip);
  res.json({ message: 'User updated' });
});

module.exports = router;
