// Generates ../postman/Workflow_Approval.postman_collection.json from the same spec used by Swagger.
const fs = require('fs');
const path = require('path');
const { endpoints } = require('../src/docs/apiSpec');

const folders = {};
for (const [method, p, tag, summary, roles, body] of endpoints) {
  const url = '{{baseUrl}}' + p.replace(/{(\w+)}/g, ':$1');
  const item = {
    name: `${method.toUpperCase()} ${p}`,
    request: {
      method: method.toUpperCase(),
      header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
      url: {
        raw: url,
        host: ['{{baseUrl}}'],
        path: p.split('/').filter(Boolean).map((s) => s.replace(/{(\w+)}/, ':$1')),
        variable: [...p.matchAll(/{(\w+)}/g)].map((m) => ({ key: m[1], value: '1' })),
      },
      description: `${summary}\n\nAccess: ${roles}`,
    },
  };
  if (body) item.request.body = { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } };
  if (p.endsWith('/attachments') && method === 'post') item.request.body = { mode: 'formdata', formdata: [{ key: 'files', type: 'file' }] };
  if (p === '/auth/login') {
    item.request.auth = { type: 'noauth' };
    item.event = [{ listen: 'test', script: { type: 'text/javascript', exec: ["const j = pm.response.json();", "if (j.token) pm.collectionVariables.set('token', j.token);"] } }];
  }
  (folders[tag] = folders[tag] || []).push(item);
}

const collection = {
  info: {
    name: 'Workflow Approval Management System',
    description: 'Run "POST /auth/login" first - the token is stored automatically. Demo logins: admin@ / manager@ / finance@ / employee@axentriq.com, password Password@123',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
  variable: [{ key: 'baseUrl', value: 'http://localhost:5000/api' }, { key: 'token', value: '' }],
  item: Object.entries(folders).map(([name, item]) => ({ name, item })),
};
const out = path.join(__dirname, '..', '..', 'postman', 'Workflow_Approval.postman_collection.json');
fs.writeFileSync(out, JSON.stringify(collection, null, 2));
console.log('Postman collection written to', out);
