export const money = (v) =>
  v == null ? '-' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '-');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
export const toInputDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export const OPERATORS = { eq: '=', gt: '>', gte: '>=', lt: '<', lte: '<=', between: 'between' };
export const FIELDS = { amount: 'Amount', days: 'Days' };

export const describeCondition = (c) => {
  const fmt = (v) => (c.field === 'amount' ? money(v) : `${v} day${v === 1 ? '' : 's'}`);
  const label = FIELDS[c.field];
  return c.operator === 'between' ? `${label} ${fmt(c.value)} to ${fmt(c.value2)}` : `${label} ${OPERATORS[c.operator]} ${fmt(c.value)}`;
};

export const describeApprover = (s) =>
  s.approver_type === 'MANAGER' ? "Requester's manager" : s.approver_type === 'USER' ? s.approver_user_name || 'User' : `Any ${s.approver_role_name || 'role'}`;
