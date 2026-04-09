-- ============================================================
--  UrbanFlow — Supabase Database Schema
--  Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── USERS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT,
  email            TEXT UNIQUE,
  role             TEXT NOT NULL DEFAULT 'citizen' CHECK (role IN ('citizen','worker','admin')),
  avatar_url       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own record"  ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own record" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can read all users"  ON public.users FOR SELECT USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
);

-- ─── REPORTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES public.users(id) ON DELETE SET NULL,
  image_url           TEXT,
  category            TEXT CHECK (category IN ('pothole','crack','water_logging','garbage')),
  ai_result           JSONB,          -- { "label": "pothole", "confidence": 0.92 }
  latitude            DOUBLE PRECISION,
  longitude           DOUBLE PRECISION,
  address             TEXT,
  status              TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','assigned','completed')),
  assigned_worker_id  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Citizens can insert own reports"   ON public.reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Citizens can read own reports"     ON public.reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Workers can read assigned reports" ON public.reports FOR SELECT USING (
  auth.uid() = assigned_worker_id OR
  (SELECT role FROM public.users WHERE id = auth.uid()) IN ('worker','admin')
);
CREATE POLICY "Admins can do everything on reports" ON public.reports FOR ALL USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "Workers can update assigned reports" ON public.reports FOR UPDATE USING (
  auth.uid() = assigned_worker_id
);

-- ─── ATTENDANCE ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id     UUID REFERENCES public.users(id) ON DELETE CASCADE,
  report_id     UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  before_image  TEXT,
  after_image   TEXT,
  login_time    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logout_time   TIMESTAMPTZ,
  notes         TEXT
);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workers manage own attendance" ON public.attendance FOR ALL USING (auth.uid() = worker_id);
CREATE POLICY "Admins read all attendance"    ON public.attendance FOR SELECT USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
);

-- ─── WORKERS (performance view) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.workers (
  id                UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  name              TEXT,
  credibility_score INT  NOT NULL DEFAULT 100,
  tasks_completed   INT  NOT NULL DEFAULT 0,
  zone              TEXT
);

ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage workers" ON public.workers FOR ALL USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "Workers read own record" ON public.workers FOR SELECT USING (auth.uid() = id);

-- ─── STORAGE BUCKET ──────────────────────────────────────────
-- Run in Supabase Dashboard → Storage → New bucket: "report-images" (public)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('report-images', 'report-images', true);

-- ─── TRIGGER: auto-insert user on signup ──────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'citizen')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
