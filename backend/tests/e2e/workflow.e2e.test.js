/**
 * End-to-end tests against a RUNNING API with the seeded database.
 *   1) npm run setup   2) npm start   3) npm run test:e2e
 * Set API_URL to test a deployed instance (default http://localhost:5000/api).
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const API = process.env.API_URL || 'http://localhost:5000/api';
const PASSWORD = 'Password@123';

async function call(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const login = async (email) => (await call('POST', '/auth/login', null, { email, password: PASSWORD })).data.token;
const typeId = async (t, code) => (await call('GET', '/request-types', t)).data.find((x) => x.code === code).id;
const pendingFor = async (t, requestId) => (await call('GET', '/approvals/pending', t)).data.find((p) => p.request_id === requestId);

async function newRequest(t, code, extra) {
  const r = await call('POST', '/requests', t, { request_type_id: await typeId(t, code), title: `E2E ${code} ${Date.now()}`, ...extra });
  assert.equal(r.status, 201);
  return r.data.id;
}

test('rejects invalid credentials and unauthenticated access', async () => {
  assert.equal((await call('POST', '/auth/login', null, { email: 'admin@axentriq.com', password: 'wrong' })).status, 401);
  assert.equal((await call('GET', '/requests')).status, 401);
});

test('role-based access: employee cannot reach admin APIs', async () => {
  const emp = await login('employee@axentriq.com');
  assert.equal((await call('GET', '/workflows', emp)).status, 403);
  assert.equal((await call('GET', '/users', emp)).status, 403);
  assert.equal((await call('GET', '/approvals/pending', emp)).status, 403);
});

test('amount-based routing: small purchase needs only the manager', async () => {
  const emp = await login('employee@axentriq.com'), mgr = await login('manager@axentriq.com');
  const id = await newRequest(emp, 'PURCHASE', { amount: 2000 });
  assert.equal((await call('POST', `/requests/${id}/submit`, emp)).status, 200);
  const task = await pendingFor(mgr, id);
  assert.ok(task, 'manager should have a pending task');
  assert.equal((await call('POST', `/approvals/${task.instance_id}/action`, mgr, { action: 'APPROVED' })).data.status, 'APPROVED');
});

test('large purchase walks Manager -> Finance -> Super Admin, in order', async () => {
  const emp = await login('employee@axentriq.com'), mgr = await login('manager@axentriq.com');
  const fin = await login('finance@axentriq.com'), adm = await login('admin@axentriq.com');
  const id = await newRequest(emp, 'PURCHASE', { amount: 60000 });
  await call('POST', `/requests/${id}/submit`, emp);
  assert.equal(await pendingFor(fin, id), undefined, 'finance must not see it before the manager approves');
  assert.equal((await call('POST', `/approvals/${(await pendingFor(mgr, id)).instance_id}/action`, mgr, { action: 'APPROVED' })).data.status, 'PENDING');
  assert.equal((await call('POST', `/approvals/${(await pendingFor(fin, id)).instance_id}/action`, fin, { action: 'APPROVED' })).data.status, 'PENDING');
  assert.equal((await call('POST', `/approvals/${(await pendingFor(adm, id)).instance_id}/action`, adm, { action: 'APPROVED' })).data.status, 'APPROVED');
});

test('rejection stops the workflow; changes requested restarts a new cycle', async () => {
  const emp = await login('employee@axentriq.com'), mgr = await login('manager@axentriq.com');
  const rej = await newRequest(emp, 'PURCHASE', { amount: 40000 });
  await call('POST', `/requests/${rej}/submit`, emp);
  const t1 = await pendingFor(mgr, rej);
  assert.equal((await call('POST', `/approvals/${t1.instance_id}/action`, mgr, { action: 'REJECTED' })).status, 422, 'comments are mandatory');
  assert.equal((await call('POST', `/approvals/${t1.instance_id}/action`, mgr, { action: 'REJECTED', comments: 'Not in budget' })).data.status, 'REJECTED');

  const chg = await newRequest(emp, 'PURCHASE', { amount: 1500 });
  await call('POST', `/requests/${chg}/submit`, emp);
  const t2 = await pendingFor(mgr, chg);
  await call('POST', `/approvals/${t2.instance_id}/action`, mgr, { action: 'CHANGES_REQUESTED', comments: 'Add a quotation' });
  assert.equal((await call('GET', `/requests/${chg}`, emp)).data.status, 'CHANGES_REQUESTED');
  assert.equal((await call('POST', `/requests/${chg}/submit`, emp)).data.cycle, 2);
});

test('duplicate / concurrent approvals: exactly one succeeds', async () => {
  const emp = await login('employee@axentriq.com'), mgr = await login('manager@axentriq.com');
  const id = await newRequest(emp, 'PURCHASE', { amount: 1000 });
  await call('POST', `/requests/${id}/submit`, emp);
  const task = await pendingFor(mgr, id);
  const results = await Promise.all(Array.from({ length: 5 }, () => call('POST', `/approvals/${task.instance_id}/action`, mgr, { action: 'APPROVED' })));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 4);
});

test('approvers cannot act on tasks not assigned to them', async () => {
  const emp = await login('employee@axentriq.com'), mgr = await login('manager@axentriq.com'), fin = await login('finance@axentriq.com');
  const id = await newRequest(emp, 'PURCHASE', { amount: 1200 });
  await call('POST', `/requests/${id}/submit`, emp);
  const task = await pendingFor(mgr, id);
  assert.equal((await call('POST', `/approvals/${task.instance_id}/action`, fin, { action: 'APPROVED' })).status, 403);
});

test('editing a workflow creates a new version and does not alter in-flight requests', async () => {
  const adm = await login('admin@axentriq.com'), emp = await login('employee@axentriq.com');
  const id = await newRequest(emp, 'WFH', { start_date: '2026-12-01', end_date: '2026-12-01' });
  await call('POST', `/requests/${id}/submit`, emp);
  const before = (await call('GET', `/requests/${id}`, emp)).data;
  const wf = (await call('GET', '/workflows', adm)).data.find((w) => w.id === before.workflow_id);
  const edit = await call('PUT', `/workflows/${wf.id}`, adm, {
    request_type_id: wf.request_type_id, name: wf.name, priority: wf.priority, is_active: true,
    conditions: [], steps: [{ name: 'Manager', approver_type: 'MANAGER' }, { name: 'Super Admin', approver_type: 'ROLE', approver_role_id: 1 }],
  });
  assert.equal(edit.status, 200);
  const after = (await call('GET', `/requests/${id}`, emp)).data;
  assert.equal(after.workflow_version, before.workflow_version, 'in-flight request keeps its pinned version');
  assert.equal(after.instances.length, before.instances.length);
  // restore the original single-step workflow so demo data stays tidy (creates one more version)
  await call('PUT', `/workflows/${wf.id}`, adm, {
    request_type_id: wf.request_type_id, name: wf.name, priority: wf.priority, is_active: true,
    conditions: [], steps: [{ name: 'Manager', approver_type: 'MANAGER', escalation_hours: 48 }],
  });
});
