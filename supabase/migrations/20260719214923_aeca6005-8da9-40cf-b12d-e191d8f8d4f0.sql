-- =========================================================================
-- workers: each user's paired recording worker (running on their machine)
-- =========================================================================
CREATE TABLE public.workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'My Mac',
  worker_url text NOT NULL,
  worker_token_ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'online',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workers_user_id_idx ON public.workers(user_id);

GRANT SELECT, DELETE ON public.workers TO authenticated;
GRANT ALL ON public.workers TO service_role;

ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own workers" ON public.workers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner deletes own workers" ON public.workers
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Deny worker inserts from users" ON public.workers
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Deny worker updates from users" ON public.workers
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

CREATE TRIGGER workers_touch_updated_at
  BEFORE UPDATE ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- worker_pairings: short-lived pairing codes
-- =========================================================================
CREATE TABLE public.worker_pairings (
  code text PRIMARY KEY,
  user_id uuid,
  worker_id uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  worker_name text NOT NULL DEFAULT 'My Mac',
  worker_token_ciphertext text NOT NULL,
  worker_url text,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX worker_pairings_user_id_idx ON public.worker_pairings(user_id);
CREATE INDEX worker_pairings_expires_at_idx ON public.worker_pairings(expires_at);

GRANT SELECT ON public.worker_pairings TO authenticated;
GRANT ALL ON public.worker_pairings TO service_role;

ALTER TABLE public.worker_pairings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own pairings" ON public.worker_pairings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Deny pairing inserts from users" ON public.worker_pairings
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Deny pairing updates from users" ON public.worker_pairings
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Deny pairing deletes from users" ON public.worker_pairings
  FOR DELETE TO authenticated USING (false);

-- =========================================================================
-- usage_daily: add quota fields
-- =========================================================================
ALTER TABLE public.usage_daily
  ADD COLUMN IF NOT EXISTS max_jobs_per_day integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS max_concurrent integer NOT NULL DEFAULT 2;