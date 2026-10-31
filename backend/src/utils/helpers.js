// Small shared helpers: audit trail + in-app notifications
async function audit(conn, userId, action, entityType, entityId, details = null, ip = null) {
  await conn.query(
    'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address) VALUES (?,?,?,?,?,?)',
    [userId || null, action, entityType, entityId || null, details ? JSON.stringify(details) : null, ip]
  );
}

async function notify(conn, userId, requestId, message) {
  if (!userId) return;
  await conn.query('INSERT INTO notifications (user_id, request_id, message) VALUES (?,?,?)', [userId, requestId || null, message]);
}

async function notifyRole(conn, roleId, requestId, message, excludeUserId = null) {
  const [users] = await conn.query('SELECT id FROM users WHERE role_id = ? AND is_active = 1 AND id <> ?', [roleId, excludeUserId || 0]);
  for (const u of users) await notify(conn, u.id, requestId, message);
}

module.exports = { audit, notify, notifyRole };
