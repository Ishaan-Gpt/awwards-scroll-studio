
-- 1) Lock down SECURITY DEFINER has_role: revoke from public/authenticated/anon
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

-- 2) usage_daily: explicit deny of writes for authenticated (service_role bypasses RLS)
CREATE POLICY "Deny inserts from users" ON public.usage_daily
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Deny updates from users" ON public.usage_daily
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Deny deletes from users" ON public.usage_daily
  FOR DELETE TO authenticated USING (false);

-- 3) user_roles: explicit deny of writes for authenticated (service_role bypasses RLS)
CREATE POLICY "Deny role inserts from users" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Deny role updates from users" ON public.user_roles
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Deny role deletes from users" ON public.user_roles
  FOR DELETE TO authenticated USING (false);
