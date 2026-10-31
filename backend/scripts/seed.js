require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, withTx } = require('../src/config/db');
const { createWorkflow } = require('../src/services/workflowConfig');
const engine = require('../src/services/workflowEngine');

const PASSWORD = 'Password@123';

(async () => {
  const [[{ c }]] = await pool.query('SELECT COUNT(*) AS c FROM roles');
  if (c > 0) { console.log('Database already seeded - skipping.'); return pool.end(); }

  await withTx(async (conn) => {
    for (const r of ['Super Admin', 'Employee', 'Approver']) await conn.query('INSERT INTO roles (name) VALUES (?)', [r]);
    const [roles] = await conn.query('SELECT id, name FROM roles');
    const role = Object.fromEntries(roles.map((r) => [r.name, r.id]));
    const hash = await bcrypt.hash(PASSWORD, 10);
    const addUser = async (name, email, roleName, designation, managerId = null) =>
      (await conn.query('INSERT INTO users (name, email, password_hash, role_id, manager_id, designation) VALUES (?,?,?,?,?,?)', [name, email, hash, role[roleName], managerId, designation]))[0].insertId;

    const admin = await addUser('Aarav Menon', 'admin@axentriq.com', 'Super Admin', 'Operations Head');
    const manager = await addUser('Meera Nair', 'manager@axentriq.com', 'Approver', 'Engineering Manager');
    const finance = await addUser('Farhan Ali', 'finance@axentriq.com', 'Approver', 'Finance Controller');
    const emp1 = await addUser('Sreejith K', 'employee@axentriq.com', 'Employee', 'Software Engineer', manager);
    const emp2 = await addUser('Anjana Das', 'employee2@axentriq.com', 'Employee', 'QA Engineer', manager);

    const type = async (name, code, desc, amt, dates) =>
      (await conn.query('INSERT INTO request_types (name, code, description, requires_amount, requires_dates) VALUES (?,?,?,?,?)', [name, code, desc, amt, dates]))[0].insertId;
    const leave = await type('Leave Request', 'LEAVE', 'Casual, sick or earned leave', 0, 1);
    const purchase = await type('Purchase Request', 'PURCHASE', 'Equipment, software or services', 1, 0);
    const expense = await type('Expense Claim', 'EXPENSE', 'Reimbursement of business expenses', 1, 0);
    const wfh = await type('Work From Home Request', 'WFH', 'Remote working days', 0, 1);

    const M = { name: 'Manager', approver_type: 'MANAGER', escalation_hours: 48 };
    const F = { name: 'Finance', approver_type: 'USER', approver_user_id: finance, escalation_hours: 48 };
    const S = { name: 'Super Admin', approver_type: 'ROLE', approver_role_id: role['Super Admin'] };
    const wf = (request_type_id, name, priority, conditions, steps) => createWorkflow(conn, { request_type_id, name, priority, conditions, steps }, admin);

    // Purchase: matches the assignment example (<= 4,000 manager only, >= 30,000 Manager -> Finance -> Super Admin)
    await wf(purchase, 'Purchase up to 4,000', 10, [{ field: 'amount', operator: 'lte', value: 4000 }], [M]);
    await wf(purchase, 'Purchase 4,000 - 30,000', 10, [{ field: 'amount', operator: 'gt', value: 4000 }, { field: 'amount', operator: 'lt', value: 30000 }], [M, F]);
    await wf(purchase, 'Purchase 30,000 and above', 10, [{ field: 'amount', operator: 'gte', value: 30000 }], [M, F, S]);
    await wf(expense, 'Expense up to 5,000', 10, [{ field: 'amount', operator: 'lte', value: 5000 }], [M, F]);
    await wf(expense, 'Expense above 5,000', 10, [{ field: 'amount', operator: 'gt', value: 5000 }], [M, F, S]);
    await wf(leave, 'Leave up to 3 days', 10, [{ field: 'days', operator: 'lte', value: 3 }], [M]);
    await wf(leave, 'Leave longer than 3 days', 10, [{ field: 'days', operator: 'gt', value: 3 }], [M, S]);
    await wf(wfh, 'Work from home', 0, [], [M]);

    // ---- demo requests so the dashboards are not empty ----
    const asUser = (id, name, roleName) => ({ id, name, role: roleName, role_id: role[roleName] });
    const mgr = asUser(manager, 'Meera Nair', 'Approver');
    const fin = asUser(finance, 'Farhan Ali', 'Approver');
    const e1 = asUser(emp1, 'Sreejith K', 'Employee');
    const e2 = asUser(emp2, 'Anjana Das', 'Employee');

    const mk = async (u, typeId, title, f = {}) => {
      const [r] = await conn.query('INSERT INTO requests (request_type_id, requester_id, title, description, amount, start_date, end_date, days, created_at) VALUES (?,?,?,?,?,?,?,?, DATE_SUB(NOW(), INTERVAL ? DAY))',
        [typeId, u.id, title, f.description || null, f.amount || null, f.start || null, f.end || null, f.days || null, f.ago || 0]);
      await conn.query("UPDATE requests SET request_no = CONCAT('REQ-', LPAD(id, 5, '0')) WHERE id = ?", [r.insertId]);
      return r.insertId;
    };
    const pending = async (id) => (await conn.query("SELECT id FROM approval_instances WHERE request_id=? AND status='PENDING'", [id]))[0][0].id;

    const a = await mk(e1, purchase, 'USB-C docking stations (x2)', { amount: 3600, description: 'For the new hires', ago: 12 });
    await engine.submitRequest(conn, a, e1); await engine.act(conn, await pending(a), mgr, 'APPROVED', 'Go ahead');

    const b = await mk(e1, purchase, 'Annual design tool licences', { amount: 48500, description: '10 seats of the design suite', ago: 6 });
    await engine.submitRequest(conn, b, e1); await engine.act(conn, await pending(b), mgr, 'APPROVED', 'Budget available'); await engine.act(conn, await pending(b), fin, 'APPROVED', 'Verified against Q4 budget');

    const c = await mk(e2, expense, 'Client visit - travel & lodging', { amount: 7200, description: 'Two-day onsite visit', ago: 3 });
    await engine.submitRequest(conn, c, e2); await engine.act(conn, await pending(c), mgr, 'APPROVED', 'Receipts verified');

    const d = await mk(e1, leave, 'Family function', { start: '2026-11-10', end: '2026-11-14', days: 5, description: 'Out of station', ago: 4 });
    await engine.submitRequest(conn, d, e1); await engine.act(conn, await pending(d), mgr, 'CHANGES_REQUESTED', 'Please share the handover plan');

    const e = await mk(e2, purchase, 'Ergonomic chairs', { amount: 31000, ago: 2 });
    await engine.submitRequest(conn, e, e2);

    const f = await mk(e2, wfh, 'WFH during broadband upgrade', { start: '2026-11-03', end: '2026-11-04', days: 2, ago: 5 });
    await engine.submitRequest(conn, f, e2); await engine.act(conn, await pending(f), mgr, 'REJECTED', 'Client demo on those days, need onsite presence');

    await mk(e1, expense, 'Team lunch (draft)', { amount: 2400, ago: 1 });
    const g = await mk(e1, wfh, 'Work from home - Friday', { start: '2026-11-06', end: '2026-11-06', days: 1, ago: 1 });
    await engine.submitRequest(conn, g, e1);
  });

  console.log('Seed complete. Login with any of these (password: ' + PASSWORD + '):');
  console.log('  admin@axentriq.com | manager@axentriq.com | finance@axentriq.com | employee@axentriq.com | employee2@axentriq.com');
  await pool.end();
})().catch(async (e) => { console.error('Seed failed:', e); await pool.end(); process.exit(1); });
