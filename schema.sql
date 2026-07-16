-- =====================================================================
-- SRTLE MOCK EXAM - SUPABASE DATABASE SCHEMA
-- =====================================================================
-- Copy and paste this SQL script into the Supabase SQL Editor on your dashboard.
-- Link: https://supabase.com/dashboard/project/hpsuubkkokftyexcciwv/sql/new

-- ---------------------------------------------------------------------
-- 1. PROFILES TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  target_score INTEGER DEFAULT 530,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create policies
CREATE POLICY "Users can read their own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ---------------------------------------------------------------------
-- 2. TRIGGER FOR NEW USERS
-- ---------------------------------------------------------------------
-- Automatically inserts a profile record when a new user registers
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, target_score)
  VALUES (new.id, new.email, 530)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ---------------------------------------------------------------------
-- 3. USER PROGRESS TABLE
-- ---------------------------------------------------------------------
-- Stores progress for practice mode and exams as JSONB
CREATE TABLE IF NOT EXISTS public.user_progress (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  practice_progress JSONB DEFAULT '{}'::JSONB NOT NULL,
  last_exam_score INTEGER,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read their own progress" ON public.user_progress;
DROP POLICY IF EXISTS "Users can insert their own progress" ON public.user_progress;
DROP POLICY IF EXISTS "Users can update their own progress" ON public.user_progress;

-- Create policies
CREATE POLICY "Users can read their own progress" ON public.user_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own progress" ON public.user_progress
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own progress" ON public.user_progress
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 4. EXAM HISTORY TABLE
-- ---------------------------------------------------------------------
-- Stores historical scores for all simulated exams taken
CREATE TABLE IF NOT EXISTS public.exam_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  score INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.exam_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read their own exam history" ON public.exam_history;
DROP POLICY IF EXISTS "Users can insert their own exam history" ON public.exam_history;

-- Create policies
CREATE POLICY "Users can read their own exam history" ON public.exam_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own exam history" ON public.exam_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 5. QUESTION ATTEMPTS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.question_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  question_id INTEGER NOT NULL,
  chapter_id TEXT NOT NULL,
  selected_answer TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  mode TEXT NOT NULL,
  session_id UUID,
  time_spent_seconds INTEGER DEFAULT 0,
  attempted_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_question UNIQUE (user_id, question_id)
);

ALTER TABLE public.question_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own attempts" ON public.question_attempts;
CREATE POLICY "Users can read their own attempts" ON public.question_attempts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own attempts" ON public.question_attempts;
CREATE POLICY "Users can insert their own attempts" ON public.question_attempts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own attempts" ON public.question_attempts;
CREATE POLICY "Users can update their own attempts" ON public.question_attempts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 6. STUDY SESSIONS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.study_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  mode TEXT NOT NULL,
  chapter_id TEXT,
  total_questions INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  score INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  duration_seconds INTEGER DEFAULT 0
);

ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own study sessions" ON public.study_sessions;
CREATE POLICY "Users can read their own study sessions" ON public.study_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own study sessions" ON public.study_sessions;
CREATE POLICY "Users can insert their own study sessions" ON public.study_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 7. AI EXPLANATIONS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_explanations (
  question_id INTEGER PRIMARY KEY,
  explanation_html TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ai_explanations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read AI explanations" ON public.ai_explanations;
CREATE POLICY "Anyone can read AI explanations" ON public.ai_explanations
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert AI explanations" ON public.ai_explanations;
CREATE POLICY "Authenticated users can insert AI explanations" ON public.ai_explanations
  FOR INSERT TO authenticated WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 8. USER STUDY PLAN TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_study_plan (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  plan_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_study_plan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own study plan" ON public.user_study_plan;
CREATE POLICY "Users can read their own study plan" ON public.user_study_plan
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own study plan" ON public.user_study_plan;
CREATE POLICY "Users can insert their own study plan" ON public.user_study_plan
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own study plan" ON public.user_study_plan;
CREATE POLICY "Users can update their own study plan" ON public.user_study_plan
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- STEP TEST TABLES (كفايات اللغة الإنجليزية)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 9. STEP QUESTIONS TABLE (AI-Generated)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.step_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  section TEXT NOT NULL CHECK (section IN ('grammar', 'reading', 'comprehensive_150')),
  topic TEXT,
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  question TEXT NOT NULL,
  passage TEXT,
  options JSONB NOT NULL,
  answer TEXT NOT NULL CHECK (answer IN ('a', 'b', 'c', 'd')),
  explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.step_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read step questions" ON public.step_questions;
CREATE POLICY "Anyone can read step questions" ON public.step_questions
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert step questions" ON public.step_questions;
CREATE POLICY "Authenticated users can insert step questions" ON public.step_questions
  FOR INSERT TO authenticated WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 10. STEP USER PROGRESS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.step_user_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES public.step_questions ON DELETE CASCADE NOT NULL,
  selected_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  time_spent_seconds INTEGER DEFAULT 0,
  attempted_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_step_user_question UNIQUE (user_id, question_id)
);

ALTER TABLE public.step_user_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own step progress" ON public.step_user_progress;
CREATE POLICY "Users can read their own step progress" ON public.step_user_progress
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own step progress" ON public.step_user_progress;
CREATE POLICY "Users can insert their own step progress" ON public.step_user_progress
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own step progress" ON public.step_user_progress;
CREATE POLICY "Users can update their own step progress" ON public.step_user_progress
  FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- 11. STEP EXAM SESSIONS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.step_exam_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  section TEXT NOT NULL,
  total_questions INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  score_percent INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.step_exam_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own step sessions" ON public.step_exam_sessions;
CREATE POLICY "Users can read their own step sessions" ON public.step_exam_sessions
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own step sessions" ON public.step_exam_sessions;
CREATE POLICY "Users can insert their own step sessions" ON public.step_exam_sessions
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
