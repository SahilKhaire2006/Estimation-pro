# EstimationPro

Full-stack AI-powered software effort estimation platform.

## Stack

- **Frontend**: React 18 + TypeScript + Tailwind + Framer Motion + Recharts
- **Backend**: FastAPI (Python 3.11) + Supabase (PostgreSQL) + Upstash Redis + Groq API
- **Local ML**: TF‑IDF similarity + LinearRegression (scikit-learn)

## 1) Database setup (Supabase)

1. Open Supabase SQL editor.
2. Run the schema file:
   - `backend/database/schema.sql`

This recreates tables fresh and enables RLS.

## 2) Backend setup (FastAPI)

From project root:

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
python -m pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### “Remove locally installed dependencies”

This project is set up to **avoid global installs** by using `backend/.venv`.  
If you previously installed packages globally by mistake, the safest fix is:

- Always run `.\.venv\Scripts\activate` before `pip install`
- Use `python -m pip ...` so it targets the active environment

### Backend environment variables

Backend loads env from the root `/.env` (already in your root per your note). Required keys:

- `SUPABASE_URL`
- `SUPABASE_KEY` (anon)
- `SUPABASE_SERVICE_KEY` (recommended for server-side DB ops)
- `GROQ_API_KEY`
- Upstash Redis (optional but supported):
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`

### Seeding + ML training

On backend startup it will:

- Read `data.json` from the project root
- Seed missing rows into `past_projects` (by `project_name`)
- Fit TF‑IDF similarity on `requirements_text`
- Train LinearRegression on:
  - \(X = [[estimated_effort_pm]]\)
  - \(y = [actual_effort_pm]\)

You should see logs like:

- `[ML] Seeded 50 projects from data.json`
- `[ML] TF-IDF fitted on 50 past projects`
- `[ML] Self-learning model trained on 50 projects — R²: 0.847`

## 3) Frontend setup (React)

```bash
cd frontend
npm install
npm run dev
```

### Frontend environment variables

Create `frontend/.env` (you can start from `frontend/.env.example`):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL` (default is `http://localhost:8000/api`)

## App routes

- `/auth` → Login / Signup
- `/auth/confirm` → Email confirmation waiting screen
- `/dashboard` → Projects grid
- `/new` → New estimation (requirements input + preview)
- `/session/:id` → Main workspace (5 tabs)
- `/share/:token` → Public read-only view

## Backend API reference

Auth:

- `GET /api/auth/me` (requires Supabase access token)

Projects:

- `GET /api/projects`
- `POST /api/projects`
- `DELETE /api/projects/{project_id}`

Sessions:

- `POST /api/sessions/bootstrap`
  - Creates **project + requirements + session**
  - Applies Redis caching for feature extraction
- `GET /api/sessions/{session_id}`
- `PATCH /api/sessions/{session_id}`
- `DELETE /api/sessions/{session_id}` (cascade delete)

Estimations:

- `POST /api/estimate/fpa`
- `POST /api/estimate/cocomo`
- `POST /api/estimate/ucp`
- `POST /api/estimate/run-all`

Code structure:

- `POST /api/code-structure/generate`
- `GET /api/code-structure/{session_id}`

Chat:

- `POST /api/chat/{session_id}`

What-if:

- `POST /api/whatif/{session_id}`

Reports:

- `POST /api/reports/{session_id}/export-pdf`
- `POST /api/reports/{session_id}/share`
- `GET /api/share/{token}` (public)

