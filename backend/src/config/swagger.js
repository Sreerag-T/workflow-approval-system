const { endpoints } = require('../docs/apiSpec');

function buildSpec() {
  const paths = {};
  for (const [method, path, tag, summary, roles, body] of endpoints) {
    const params = [...path.matchAll(/{(\w+)}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'integer' } }));
    const op = {
      tags: [tag], summary, description: `**Access:** ${roles}`, parameters: params,
      responses: { 200: { description: 'Success' }, 401: { description: 'Unauthenticated' }, 403: { description: 'Forbidden' }, 409: { description: 'Conflict (e.g. already processed)' }, 422: { description: 'Validation error' } },
    };
    if (roles === 'Public') op.security = [];
    if (body) op.requestBody = { required: true, content: { 'application/json': { schema: { type: 'object', example: body } } } };
    if (path.endsWith('/attachments') && method === 'post')
      op.requestBody = { content: { 'multipart/form-data': { schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } } } } } };
    (paths[path] = paths[path] || {})[method] = op;
  }
  return {
    openapi: '3.0.3',
    info: { title: 'Dynamic Workflow Approval Management System API', version: '1.0.0', description: 'Click **Authorize** and paste the JWT returned by `POST /auth/login`.' },
    servers: [{ url: '/api' }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    security: [{ bearerAuth: [] }],
    paths,
  };
}

module.exports = { buildSpec };
