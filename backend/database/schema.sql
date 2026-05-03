-- ============================================================
-- EstimationPro — Complete Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- EXTENSION
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- DROP EXISTING TABLES (safe re-run)
-- ============================================================
DROP TABLE IF EXISTS public.audit_logs        CASCADE;
DROP TABLE IF EXISTS public.whatif_scenarios  CASCADE;
DROP TABLE IF EXISTS public.shared_reports    CASCADE;
DROP TABLE IF EXISTS public.estimations       CASCADE;
DROP TABLE IF EXISTS public.requirements      CASCADE;
DROP TABLE IF EXISTS public.sessions          CASCADE;
DROP TABLE IF EXISTS public.projects          CASCADE;
DROP TABLE IF EXISTS public.past_projects     CASCADE;
DROP TABLE IF EXISTS public.profiles          CASCADE;

-- ============================================================
-- PROFILES
-- Auto-created on first login via ensure_profile()
-- ============================================================
CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  full_name   text,
  company     text,
  role        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PAST PROJECTS  (ML training data — seeded from data.json)
-- ============================================================
CREATE TABLE public.past_projects (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  project_name          text NOT NULL,
  domain                text,
  requirements_text     text,
  structured_features   jsonb,
  code_structure        text,
  tech_stack            jsonb  DEFAULT '[]',
  estimated_effort_pm   numeric,
  actual_effort_pm      numeric,
  complexity_score      numeric,
  features_count        integer,
  fpa_fp                integer,
  cocomo_effort_pm      numeric,
  cocomo_duration_months numeric,
  ucp_points            numeric,
  outcome               text,   -- 'on_time' | 'delayed' | 'cancelled'
  completed_at          timestamptz DEFAULT now()
);

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE public.projects (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_name  text NOT NULL,
  description   text,
  industry      text,
  project_type  text DEFAULT 'Organic',
  language      text DEFAULT 'Java',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- REQUIREMENTS
-- ============================================================
CREATE TABLE public.requirements (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id          uuid NOT NULL REFERENCES public.projects(id)  ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  requirements_text   text NOT NULL,
  requirements_hash   text,
  structured_features jsonb,
  feature_count       integer,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- SESSIONS
-- ============================================================
CREATE TABLE public.sessions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES public.projects(id)  ON DELETE CASCADE,
  estimation_id   uuid,   -- FK added after estimations table
  session_name    text,
  description     text,
  session_state   jsonb NOT NULL DEFAULT '{}',
  is_saved        boolean DEFAULT true,
  view_count      integer DEFAULT 0,
  pdf_url         text,
  share_token     text UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_accessed   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ESTIMATIONS
-- ============================================================
CREATE TABLE public.estimations (
  id                              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                         uuid NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  project_id                      uuid NOT NULL REFERENCES public.projects(id)  ON DELETE CASCADE,
  requirements_id                 uuid REFERENCES public.requirements(id)       ON DELETE SET NULL,
  -- FPA
  fp_external_inputs              integer,
  fp_external_outputs             integer,
  fp_external_inquiries           integer,
  fp_ilf                          integer,
  fp_eif                          integer,
  fp_raw_score                    integer,
  vaf_scores                      jsonb,
  vaf_value                       numeric,
  adjusted_fp                     integer,
  fp_distribution                 jsonb,
  -- COCOMO II
  loc_estimated                   integer,
  loc_language                    text DEFAULT 'Java',
  cocomo_effort_pm                numeric,
  cocomo_duration_months          numeric,
  cocomo_project_type             text,
  cocomo_team_experience          integer,
  cocomo_complexity_multiplier    numeric,
  cocomo_schedule_constraint      numeric,
  -- UCP
  ucp_actors                      jsonb,
  ucp_use_cases                   jsonb,
  ucp_points                      numeric,
  ucp_technical_factors           jsonb,
  ucp_environmental_factors       jsonb,
  -- Self-learning
  self_learning_effort_pm         numeric,
  self_learning_confidence        numeric,
  self_learning_correction_factor numeric,
  self_learning_reasoning         text,
  -- Comparison
  method_comparison               jsonb,
  planning_data                   jsonb,
  risk_data                       jsonb,
  coq_data                        jsonb,
  confidence_level                integer DEFAULT 85,
  recommended_method              text,
  status                          text DEFAULT 'completed',
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

-- FK from sessions → estimations (added after both tables exist)
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_estimation_id_fkey
  FOREIGN KEY (estimation_id) REFERENCES public.estimations(id) ON DELETE SET NULL;

-- ============================================================
-- WHATIF SCENARIOS
-- ============================================================
CREATE TABLE public.whatif_scenarios (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id           uuid NOT NULL REFERENCES public.sessions(id)  ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  scenario_name        text NOT NULL,
  scenario_description text,
  adjusted_parameters  jsonb,
  results              jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- SHARED REPORTS
-- ============================================================
CREATE TABLE public.shared_reports (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id      uuid NOT NULL REFERENCES public.profiles(id)    ON DELETE CASCADE,
  estimation_id uuid NOT NULL REFERENCES public.estimations(id) ON DELETE CASCADE,
  share_token   text UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  access_level  text DEFAULT 'view',
  expiry_date   timestamptz DEFAULT (now() + interval '7 days'),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE public.audit_logs (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action        text NOT NULL,
  resource_type text,
  resource_id   uuid,
  changes       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES  (speed up common queries)
-- ============================================================
CREATE INDEX idx_projects_user_id        ON public.projects(user_id);
CREATE INDEX idx_sessions_user_id        ON public.sessions(user_id);
CREATE INDEX idx_sessions_project_id     ON public.sessions(project_id);
CREATE INDEX idx_requirements_project_id ON public.requirements(project_id);
CREATE INDEX idx_estimations_user_id     ON public.estimations(user_id);
CREATE INDEX idx_estimations_project_id  ON public.estimations(project_id);
CREATE INDEX idx_whatif_session_id       ON public.whatif_scenarios(session_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.past_projects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatif_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_reports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs       ENABLE ROW LEVEL SECURITY;

-- ---- profiles ----
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_delete_own" ON public.profiles
  FOR DELETE USING (auth.uid() = id);

-- ---- projects ----
CREATE POLICY "projects_select_own" ON public.projects
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "projects_insert_own" ON public.projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "projects_update_own" ON public.projects
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "projects_delete_own" ON public.projects
  FOR DELETE USING (auth.uid() = user_id);

-- ---- requirements ----
CREATE POLICY "requirements_select_own" ON public.requirements
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "requirements_insert_own" ON public.requirements
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "requirements_update_own" ON public.requirements
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "requirements_delete_own" ON public.requirements
  FOR DELETE USING (auth.uid() = user_id);

-- ---- sessions ----
CREATE POLICY "sessions_select_own" ON public.sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sessions_insert_own" ON public.sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sessions_update_own" ON public.sessions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sessions_delete_own" ON public.sessions
  FOR DELETE USING (auth.uid() = user_id);

-- ---- estimations ----
CREATE POLICY "estimations_select_own" ON public.estimations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "estimations_insert_own" ON public.estimations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "estimations_update_own" ON public.estimations
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "estimations_delete_own" ON public.estimations
  FOR DELETE USING (auth.uid() = user_id);

-- ---- past_projects ----
-- Anyone authenticated can read (ML similarity search)
-- Only the owner (or service role) can insert/update/delete
CREATE POLICY "past_projects_select_all" ON public.past_projects
  FOR SELECT USING (true);
CREATE POLICY "past_projects_insert_own" ON public.past_projects
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "past_projects_update_own" ON public.past_projects
  FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "past_projects_delete_own" ON public.past_projects
  FOR DELETE USING (auth.uid() = user_id OR user_id IS NULL);

-- ---- whatif_scenarios ----
CREATE POLICY "whatif_select_own" ON public.whatif_scenarios
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "whatif_insert_own" ON public.whatif_scenarios
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "whatif_update_own" ON public.whatif_scenarios
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "whatif_delete_own" ON public.whatif_scenarios
  FOR DELETE USING (auth.uid() = user_id);

-- ---- shared_reports ----
-- Public read by token (no auth needed for share links)
-- Only owner can create/delete
CREATE POLICY "shared_reports_public_read" ON public.shared_reports
  FOR SELECT USING (true);
CREATE POLICY "shared_reports_insert_own" ON public.shared_reports
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "shared_reports_delete_own" ON public.shared_reports
  FOR DELETE USING (auth.uid() = owner_id);

-- ---- audit_logs ----
CREATE POLICY "audit_logs_select_own" ON public.audit_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "audit_logs_insert_own" ON public.audit_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- HELPER: auto-update updated_at on profiles
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_estimations_updated_at
  BEFORE UPDATE ON public.estimations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
