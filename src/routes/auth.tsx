import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : "",
  }),
  head: () => ({
    meta: [
      { title: "Sign in — SmoothRecord" },
      { name: "description", content: "Sign in to SmoothRecord to record Awwwards-style videos of any website." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // If already signed in, go to app.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: safeNext(next) || "/app", replace: true });
    });
  }, [navigate, next]);

  function safeNext(n: string): string | null {
    if (!n) return null;
    try {
      if (n.startsWith("/")) return n;
      const u = new URL(n);
      if (typeof window !== "undefined" && u.origin === window.location.origin) return u.pathname + u.search;
    } catch {
      /* ignore */
    }
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setMsg(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + "/app" },
        });
        if (error) throw error;
        setMsg("Check your inbox to confirm your email, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: safeNext(next) || "/app", replace: true });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setErr(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth" + (next ? `?next=${encodeURIComponent(next)}` : ""),
    });
    if (result.error) { setErr(result.error.message ?? String(result.error)); return; }
    if (result.redirected) return;
    navigate({ to: safeNext(next) || "/app", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <Link to="/" className="font-display text-3xl block mb-10">
          Smooth<span className="italic text-acid">Record</span>
        </Link>

        <div className="rounded-2xl border border-border bg-card p-8">
          <h1 className="font-display text-4xl mb-1">{mode === "signin" ? "Welcome back" : "Create an account"}</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === "signin" ? "Sign in to start recording." : "Start recording sites in one click."}
          </p>

          <button
            type="button"
            onClick={google}
            className="w-full mb-4 h-11 rounded-lg border border-border bg-secondary hover:bg-secondary/70 transition flex items-center justify-center gap-2 text-sm font-medium"
          >
            <GoogleIcon /> Continue with Google
          </button>

          <div className="flex items-center gap-3 my-5 text-xs text-muted-foreground">
            <div className="flex-1 h-px bg-border" /> or email <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <input
              type="email" required autoComplete="email" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full h-11 rounded-lg bg-secondary border border-border px-3 text-sm outline-none focus:border-acid"
            />
            <input
              type="password" required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="Password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full h-11 rounded-lg bg-secondary border border-border px-3 text-sm outline-none focus:border-acid"
            />
            {err && <p className="text-sm text-destructive">{err}</p>}
            {msg && <p className="text-sm text-acid">{msg}</p>}
            <button
              type="submit" disabled={busy}
              className="w-full h-11 rounded-lg bg-acid text-background font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <button
            type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-5 text-sm text-muted-foreground hover:text-foreground w-full text-center"
          >
            {mode === "signin" ? "New to SmoothRecord? Create an account" : "Already have an account? Sign in"}
          </button>
        </div>

        <p className="mt-6 text-xs text-muted-foreground text-center">
          By continuing you agree to our terms. No credit card required.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"/>
    </svg>
  );
}
