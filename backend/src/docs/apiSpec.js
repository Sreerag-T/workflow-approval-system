// Single source of truth for API docs: feeds both Swagger (OpenAPI 3) and the generated Postman collection.
// [method, path, tag, summary, roles, sample body]
const A = 'Super Admin', E = 'Employee', P = 'Approver';
const ALL = 'Any authenticated user';

const endpoints = [
  ['post', '/auth/login', 'Auth', 'Login and receive a JWT', 'Public', { email: 'admin@axentriq.com', password: 'Password@123' }],
  ['get', '/auth/me', 'Auth', 'Current user profile', ALL],

  ['get', '/dashboard', 'Dashboard', 'Statistics, charts data, my pending tasks and recent activity (scoped by role)', ALL],

  ['get', '/requests', 'Requests', 'List requests (query: status, type, q, mine, page, limit). Employees see only their own', ALL],
  ['post', '/requests', 'Requests', 'Create a draft request', ALL, { request_type_id: 2, title: 'Laptop for design team', description: 'Need 2 laptops', amount: 45000 }],
  ['get', '/requests/{id}', 'Requests', 'Request detail with approval instances, history, attachments and permissions', ALL],
  ['put', '/requests/{id}', 'Requests', 'Edit a DRAFT / CHANGES_REQUESTED request (owner only)', E, { request_type_id: 2, title: 'Laptop for design team', amount: 52000 }],
  ['post', '/requests/{id}/submit', 'Requests', 'Submit (or re-submit) - selects the matching workflow and starts a new approval cycle', ALL],
  ['post', '/requests/{id}/cancel', 'Requests', 'Cancel an eligible request (owner only)', ALL],
  ['post', '/requests/{id}/attachments', 'Requests', 'Upload up to 5 supporting documents (multipart field "files")', ALL],
  ['delete', '/requests/{id}/attachments/{attId}', 'Requests', 'Remove an attachment from an editable request', ALL],
  ['get', '/requests/{id}/attachments/{attId}/download', 'Requests', 'Download an attachment', ALL],

  ['get', '/approvals/pending', 'Approvals', 'Pending approval tasks assigned to me', `${P}, ${A}`],
  ['get', '/approvals/history', 'Approvals', 'Actions I have taken', `${P}, ${A}`],
  ['post', '/approvals/{id}/action', 'Approvals', 'Approve / reject / request changes on an approval instance (comments mandatory for reject & changes)', `${P}, ${A}`, { action: 'APPROVED', comments: 'Looks good' }],
  ['post', '/approvals/escalate-now', 'Approvals', 'Run the SLA escalation job immediately', A],

  ['get', '/workflows', 'Workflows', 'List workflows with their current version, conditions and steps', A],
  ['post', '/workflows', 'Workflows', 'Create a workflow (version 1)', A, {
    request_type_id: 2, name: 'Purchase above 50k', priority: 10, is_active: true,
    conditions: [{ field: 'amount', operator: 'gte', value: 50000 }],
    steps: [{ name: 'Manager', approver_type: 'MANAGER' }, { name: 'Finance', approver_type: 'USER', approver_user_id: 3, escalation_hours: 24 }, { name: 'Super Admin', approver_type: 'ROLE', approver_role_id: 1 }],
  }],
  ['put', '/workflows/{id}', 'Workflows', 'Edit a workflow - creates a NEW version; submitted requests keep their version', A, {
    request_type_id: 2, name: 'Purchase above 50k', priority: 10, is_active: true,
    conditions: [{ field: 'amount', operator: 'gte', value: 50000 }],
    steps: [{ name: 'Manager', approver_type: 'MANAGER' }, { name: 'Super Admin', approver_type: 'ROLE', approver_role_id: 1 }],
  }],
  ['patch', '/workflows/{id}/status', 'Workflows', 'Activate / deactivate a workflow', A, { is_active: false }],
  ['get', '/workflows/{id}/versions', 'Workflows', 'Version history with number of requests pinned to each version', A],

  ['get', '/request-types', 'Request Types', 'List request types (inactive ones only for Super Admin)', ALL],
  ['post', '/request-types', 'Request Types', 'Create a request type', A, { name: 'Travel Request', code: 'TRAVEL', requires_amount: true, requires_dates: true, is_active: true }],
  ['put', '/request-types/{id}', 'Request Types', 'Update a request type', A, { name: 'Travel Request', code: 'TRAVEL', requires_amount: true, requires_dates: true, is_active: true }],

  ['get', '/users', 'Users', 'List users', A],
  ['get', '/users/roles', 'Users', 'List roles', A],
  ['post', '/users', 'Users', 'Create a user', A, { name: 'New Employee', email: 'new@axentriq.com', password: 'Password@123', role_id: 2, manager_id: 2, designation: 'Developer' }],
  ['put', '/users/{id}', 'Users', 'Update a user (role, manager, active flag, optional new password)', A, { name: 'New Employee', email: 'new@axentriq.com', role_id: 2, manager_id: 2, designation: 'Developer', is_active: true }],

  ['get', '/notifications', 'Notifications', 'My latest notifications + unread count', ALL],
  ['post', '/notifications/read-all', 'Notifications', 'Mark all as read', ALL],
  ['patch', '/notifications/{id}/read', 'Notifications', 'Mark one as read', ALL],

  ['get', '/reports/approval-history', 'Reports', 'Approval history of every request', A],
  ['get', '/reports/audit-logs', 'Reports', 'Audit trail', A],
];

module.exports = { endpoints };
