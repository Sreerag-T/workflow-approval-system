const app = require('./app');
const { pool, withTx } = require('./config/db');
const { escalateOverdue } = require('./services/workflowEngine');

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}  |  Swagger: http://localhost:${port}/api-docs`);
});

// SLA escalation job: moves overdue approvals to the configured escalation approver
const every = Number(process.env.ESCALATION_INTERVAL_SEC || 60) * 1000;
setInterval(async () => {
  try {
    const n = await escalateOverdue(pool, withTx);
    if (n) console.log(`[escalation] escalated ${n} overdue approval(s)`);
  } catch (e) {
    console.error('[escalation] failed:', e.message);
  }
}, every);
