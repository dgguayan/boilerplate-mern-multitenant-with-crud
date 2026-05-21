# MERN Multi-Tenant SaaS Boilerplate

Production-ready MERN stack with JWT auth, RBAC, multi-tenancy, and full CRUD. Deploy backend to Render, frontend to Vercel.

## Quick start

```bash
# 1. Clone & install
cd backend && cp .env.example .env   # fill in MONGO_URI + secrets
npm install

cd ../frontend && cp .env.example .env
npm install

# 2. Seed the database (optional)
cd backend && npm run seed

# 3. Run both servers
cd backend  && npm run dev   # http://localhost:5000
cd frontend && npm run dev   # http://localhost:5173
```

## Seed test accounts (tenantSlug: acme / password: Password123!)

| Role        | Email                  |
|-------------|------------------------|
| superadmin  | superadmin@acme.com    |
| admin       | admin@acme.com         |
| manager     | manager@acme.com       |
| user        | user@acme.com          |

---

## Architecture

```
browser  →  React (Vite)  →  Axios (Bearer token)
                                     ↓
                            Express (Render)
                              ├─ CORS + Helmet
                              ├─ Rate limiter
                              ├─ auth.middleware   ← verifies JWT
                              ├─ role.middleware   ← RBAC check
                              ├─ tenant.middleware ← scopes queries
                              ├─ Joi validation
                              └─ controllers → services → Mongoose
                                                               ↓
                                                        MongoDB Atlas
```

## Security checklist

- [x] JWT access tokens (15 min) + HTTP-only cookie refresh tokens (7 days)
- [x] bcrypt password hashing (12 rounds)
- [x] Helmet security headers
- [x] CORS restricted to `FRONTEND_URL`
- [x] Rate limiting on auth routes (20 req / 15 min) + global (300 req / min)
- [x] Joi input validation on all routes
- [x] Body size limit (10kb)
- [x] Tenant isolation on every DB query (no cross-tenant leakage)
- [x] Soft deletes (no permanent data loss)
- [x] Centralized error handler (no stack traces in production)

## Deployment

### Backend → Render

1. Create a new **Web Service** → connect your repo → set root to `backend/`
2. Build command: `npm install`
3. Start command: `npm start`
4. Add environment variables (from `.env.example`)

### Frontend → Vercel

1. Import repo → set root to `frontend/`
2. Set `VITE_API_URL` to your Render backend URL
3. Add a `vercel.json` for SPA routing (already included)

---

## Extending

### Add a new resource (e.g. Tasks)

1. `models/Task.model.js` — include `tenantId`, `createdBy`, `deleted`
2. `services/task.service.js` — all queries filter by `tenantId`
3. `controllers/task.controller.js` — thin, calls service
4. `routes/task.routes.js` — apply `authMiddleware`, `tenantMiddleware`, `requireRole`
5. `app.js` — `app.use('/api/tasks', taskRoutes)`
6. Frontend: `src/api/task.api.js` + new page

### Add a new role

- Add to the `ROLES` array in `User.model.js`
- Update `ROLE_HIERARCHY` in `AuthContext.jsx`
- Add permission checks in `project.service.js` and route middleware
