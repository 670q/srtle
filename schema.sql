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
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email)
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
