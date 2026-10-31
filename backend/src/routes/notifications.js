const router = require('express').Router();
const { pool } = require('../config/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', async (req, res) => {
  const [items] = await pool.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30', [req.user.id]);
  const [[{ unread }]] = await pool.query('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
  res.json({ items, unread });
});

router.post('/read-all', async (req, res) => {
  await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ message: 'All notifications marked as read' });
});

router.patch('/:id/read', async (req, res) => {
  await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ message: 'Notification marked as read' });
});

module.exports = router;
