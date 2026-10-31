**Live demo:** https://workflow-approval-system-eight.vercel.app
**API docs (Swagger):** https://workflow-approval-system-9qsq.onrender.com/api-docs
**Demo logins:** admin@axentriq.com, manager@axentriq.com, finance@axentriq.com, employee@axentriq.com (password `Password@123`)

> Hosted on free tiers: the first request can take about 50 seconds while the server wakes up.


# Axentriq Flow - Dynamic Workflow Approval Management System

Employees raise Leave, Purchase, Expense and WFH requests. Approvals are routed automatically through **workflows that the
Super Admin configures in the UI** - approval levels, approvers, amount/day conditions, SLA escalation. No approval rule is hardcoded.

**Stack:** React 18 (Vite, Redux Toolkit + RTK Query, Axios, React Router) - Node.js + Express - MySQL 8 - JWT - Swagger

## 1. Quick start

Prerequisites: Node.js 18+ and MySQL 8 (or Docker).

```bash
# 0) (optional) MySQL via Docker - root password root123
docker compose up -d

# 1) Backend
cd backend
cp .env.example .env          # then edit DB_USER / DB_PASSWORD / JWT_SECRET
npm install
npm run setup                 # creates the database, tables and demo data (migrate + seed)
npm run dev                   # API on http://localhost:5000   Swagger: http://localhost:5000/api-docs

# 2) Frontend (new terminal)
cd frontend
npm install
npm run dev                   # App on http://localhost:5173
```

### Demo logins (password `Password@123`)
| Role | Email | Notes |
|---|---|---|
| Super Admin | admin@axentriq.com | configures workflows, users, request types; sees everything |
| Approver (Manager) | manager@axentriq.com | first approver for the employees |
| Approver (Finance) | finance@axentriq.com | second level for larger amounts |
| Employee | employee@axentriq.com / employee2@axentriq.com | raise and track requests |

The seed also creates sample requests in every status so the dashboards are populated.

### Suggested 5-minute demo
1. Sign in as **employee** -> New request -> *Purchase*, amount **60000** -> Submit. The detail page shows the chain Manager -> Finance -> Super Admin.
2. Sign in as **manager** -> Approvals -> Review -> Approve. Then **finance**, then **admin**.
3. As the employee submit a purchase of **2000**: only the manager is needed (amount-based routing).
4. Reject with a comment: workflow stops. "Request changes" returns it to the employee; resubmitting starts **cycle 2**.
5. As **admin** open Workflows -> edit a workflow -> *Save as new version*. Open *Versions*: old requests still use the old version.
6. Add a new request type and a workflow for it - no code change needed.

## 2. Features mapped to the task

| Requirement | Where |
|---|---|
| Dashboard: totals, my pending tasks, recent activity, charts | `routes/dashboard.js`, `pages/Dashboard.jsx` |
| Requests: create / edit draft / submit / cancel / attachments / history | `routes/requests.js`, `pages/Request*.jsx` |
| Dynamic workflow configuration (types, levels, approvers, conditions, activate/deactivate) | `routes/workflows.js`, `pages/Workflows.jsx` |
| Approvals: pending list, approve / reject / request changes with comments, auto-assign next level | `routes/approvals.js`, `services/workflowEngine.js` |
| Reject stops workflow | `act()` cancels remaining steps |
| Changes requested -> new approval cycle on resubmission | `submitRequest()` increments `current_cycle` |
| Duplicate / concurrent action protection | row lock + conditional update + unique key (see below) |
| Workflow versioning | `workflow_versions`; requests pin `workflow_version_id` |
| Escalation on deadlines | step `escalation_hours`; job in `server.js`; manual trigger in Workflows page |
| Audit trail + approval history | `audit_logs`, `approval_actions`, History & audit page |
| JWT auth, role-based API access, role-based UI | `middleware/auth.js`, `ProtectedRoute.jsx`, sidebar by role |
| Swagger + Postman | `/api-docs`, `postman/Workflow_Approval.postman_collection.json` |

## 3. How the workflow engine works

1. **Configuration** - a *workflow* belongs to a request type. Each save creates an immutable *version* holding
   *conditions* (`amount`/`days` with `= > >= < <= between`, AND-ed) and ordered *steps*.
   A step's approver is a specific user, anyone with a role, or the requester's manager.
2. **Selection** - on submit the engine takes all active workflows of the type, keeps those whose conditions match the request,
   and picks by priority, then by specificity (most conditions). Example (seeded):
   - Purchase <= 4,000 -> Manager
   - Purchase 4,000 - 30,000 -> Manager -> Finance
   - Purchase >= 30,000 -> Manager -> Finance -> Super Admin
3. **Execution** - one `approval_instance` row per step per cycle. Only the first is `PENDING`; approving activates the next; the last approval marks the request `APPROVED`.
   Steps whose approver is the requester are auto-skipped (and logged).
4. **Versioning** - the request stores `workflow_version_id`. Editing a workflow only adds version N+1, so in-flight requests are never affected.
   (On *resubmission after changes*, the current active workflow is re-evaluated because the amount may have changed.)
5. **Concurrency** - every action runs in a transaction that first locks the request row (`SELECT ... FOR UPDATE`), then re-checks the instance is still `PENDING`,
   then updates with `WHERE status='PENDING'`. `UNIQUE(request_id, cycle_no, step_order)` prevents duplicate instances. Five parallel approvals -> exactly one succeeds, four get HTTP 409 (covered by the e2e test).
6. **Escalation** - when a step becomes pending, `due_at = now + escalation_hours`. A background job (every `ESCALATION_INTERVAL_SEC`) reassigns overdue steps to the configured escalation user (or any Super Admin), logs it and notifies.

## 4. Database

Tables: `roles, users, request_types, workflows, workflow_versions, workflow_conditions, workflow_steps, requests, request_attachments,
approval_instances, approval_actions, notifications, audit_logs`. Full DDL: `backend/database/migrations/001_init.sql`.

```
roles 1-* users            request_types 1-* workflows 1-* workflow_versions 1-* workflow_steps
users 1-* requests         workflow_versions 1-* workflow_conditions
requests *-1 workflow_versions (pinned)
requests 1-* approval_instances (per cycle & step) 1-* approval_actions
requests 1-* request_attachments / notifications ; audit_logs (any entity)
```

## 5. Tests

```bash
cd backend
npm test            # unit tests (condition matching & workflow selection) - no DB needed
npm run setup && npm start      # in one terminal
npm run test:e2e    # in another: auth, RBAC, amount routing, 3-level chain, reject, changes->cycle 2, concurrent approvals, versioning
```
Set `API_URL=https://your-api/api` to run the e2e suite against a deployed instance.

## 6. API documentation
- Swagger UI: `http://localhost:5000/api-docs` (click **Authorize**, paste the token from `POST /auth/login`)
- Postman: import `postman/Workflow_Approval.postman_collection.json`, run **Auth -> POST /auth/login** first (token is saved automatically).
- Regenerate both from one spec: edit `backend/src/docs/apiSpec.js`, then `npm run postman`.

## 7. Deployment (free tier)
- **Database:** Aiven / Railway / PlanetScale-compatible MySQL. Run `npm run setup` once with its credentials.
- **Backend (Render / Railway):** root `backend`, build `npm install`, start `npm start`. Set `DB_*`, `JWT_SECRET`, `CLIENT_URL=<frontend url>`.
  (Uploaded files are stored on local disk; use a persistent disk or object storage for production.)
- **Frontend (Vercel / Netlify):** root `frontend`, build `npm run build`, output `dist`. Set `VITE_API_URL=https://<backend>/api`.
  Add a rewrite of all routes to `/index.html` (SPA).

## 8. Security notes
bcrypt password hashing - JWT with expiry - user re-loaded on each request (deactivation is immediate) - role guards on every route - zod validation on every body -
parameterised SQL only - helmet, CORS allow-list, login rate limit - upload type/size whitelist - approvers can only act on tasks assigned to them and never on their own requests.

## 9. Assumptions
- Currency is INR; amount and number-of-days are the supported condition fields.
- A Super Admin acts on a request only when a step is assigned to them (no blanket override), keeping the audit trail strict.
- If the requester has no manager, a "Manager" step falls back to any Super Admin.
