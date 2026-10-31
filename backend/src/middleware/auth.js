const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { HttpError } = require('../utils/errors');

const ROLES = { ADMIN: 'Super Admin', EMPLOYEE: 'Employee', APPROVER: 'Approver' };

/** Verifies the JWT and loads the *current* user (so deactivated users lose access immediately). */
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Authentication required');
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
  const [rows] = await pool.query(
    'SELECT u.id, u.name, u.email, u.role_id, r.name AS role, u.is_active FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?',
    [payload.id]
  );
  if (!rows[0] || !rows[0].is_active) throw new HttpError(401, 'Account not found or deactivated');
  req.user = rows[0];
  next();
}

/** Role-based authorization guard: authorize('Super Admin', 'Approver') */
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw new HttpError(403, 'You do not have permission to perform this action');
  next();
};

module.exports = { authenticate, authorize, ROLES };
