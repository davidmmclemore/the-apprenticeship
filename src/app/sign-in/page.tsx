"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useState } from "react";
import { ConfigNotice } from "@/components/app-shell";
import { BrandMark } from "@/components/icons";
import { useApp } from "@/components/providers";
import { describeError, isConfigured, supabase } from "@/lib/supabase";

/** Only allow redirects back into this app. */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}

type Mode = "password" | "link" | "create";

function SignIn() {
  const { ready, user } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const emailId = useId();
  const passwordId = useId();

  useEffect(() => {
    if (ready && user) router.replace(next);
  }, [ready, user, next, router]);

  if (!isConfigured) return <ConfigNotice />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const auth = supabase().auth;
    try {
      if (mode === "password") {
        const { error: err } = await auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      } else if (mode === "link") {
        const redirect = `${window.location.origin}/sign-in?next=${encodeURIComponent(next)}`;
        const { error: err } = await auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: redirect, shouldCreateUser: false },
        });
        if (err) throw err;
        setMessage("Check your email for a sign-in link. You can close this tab.");
      } else {
        const redirect = `${window.location.origin}/sign-in?next=${encodeURIComponent(next)}`;
        const { data, error: err } = await auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirect } });
        if (err) throw err;
        if (!data.session) setMessage("Account created. Check your email to confirm it, then sign in.");
      }
    } catch (err) {
      const msg = describeError(err);
      setError(/invalid login credentials/i.test(msg) ? "That email and password don’t match an account." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main" className="signin">
      <div className="signin-card">
        <div className="stack" style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <BrandMark width={52} height={52} style={{ margin: "0 auto" }} />
          <h1 style={{ fontSize: "2.1rem", marginBottom: 0 }}>The Apprenticeship</h1>
          <p className="lede" style={{ margin: 0 }}>
            A sustained season inside an author’s work.
          </p>
        </div>

        <form className="card stack" onSubmit={submit} noValidate>
          <div className="segmented" role="group" aria-label="How to sign in" style={{ justifySelf: "center" }}>
            {(
              [
                ["password", "Password"],
                ["link", "Email link"],
                ["create", "New account"],
              ] as const
            ).map(([m, label]) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
                {label}
              </button>
            ))}
          </div>

          <div className="field">
            <label htmlFor={emailId}>Email</label>
            <input
              id={emailId}
              className="input"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {mode !== "link" && (
            <div className="field">
              <label htmlFor={passwordId}>Password</label>
              <input
                id={passwordId}
                className="input"
                type="password"
                autoComplete={mode === "create" ? "new-password" : "current-password"}
                required
                minLength={mode === "create" ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === "create" && <div className="field-hint">At least 8 characters.</div>}
            </div>
          )}

          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="notice" role="status">
              {message}
            </p>
          )}

          <button className="btn btn-primary btn-block" type="submit" disabled={busy || !email || (mode !== "link" && !password)}>
            {busy ? "One moment…" : mode === "password" ? "Sign in" : mode === "link" ? "Email me a sign-in link" : "Create account"}
          </button>
          <p className="small muted" style={{ margin: 0, textAlign: "center" }}>
            Uses your Gathered Pages account. Your reading here is private to you.
          </p>
        </form>
      </div>
    </main>
  );
}
