const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { pool } = require('../config/db');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { HttpError } = require('../utils/errors');
const { audit } = require('../utils/helpers');

const loginSchema = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Password is required') });

router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await pool.query(
    'SELECT u.id, u.name, u.email, u.password_hash, u.is_active, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ?',
    [email]
  );
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) throw new HttpError(401, 'Invalid email or password');
  if (!u.is_active) throw new HttpError(403, 'Your account has been deactivated');
  const token = jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
  await audit(pool, u.id, 'LOGIN', 'user', u.id, null, req.ip);
  res.json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});

router.get('/me', authenticate, (req, res) => {
  const { id, name, email, role } = req.user;
  res.json({ id, name, email, role });
});

module.exports = router;
