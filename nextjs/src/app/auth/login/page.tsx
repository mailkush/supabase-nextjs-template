"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSPAClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSPAClient(), []);

  const [mode, setMode] = useState<"signin" | "signup" | "magic">("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const resetMsgs = () => {
    setError(null);
    setOk(null);
  };

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMsgs();
    setLoading(true);

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInErr) {
      setError(signInErr.message);
      setLoading(false);
      return;
    }

    router.replace("/dashboard");
  };

  const onSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMsgs();
    setLoading(true);

    const { error: signUpErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });

    if (signUpErr) {
      setError(signUpErr.message);
      setLoading(false);
      return;
    }

    setOk("Check your email to confirm your account ✅");
    setLoading(false);
  };

  const onMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMsgs();

    const eTrim = email.trim();
    if (!eTrim) {
      setError("Enter your email first.");
      return;
    }

    setLoading(true);

    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: eTrim,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });

    if (otpErr) {
      setError(otpErr.message);
      setLoading(false);
      return;
    }

    setOk("Magic link sent ✅ Check your email.");
    setLoading(false);
  };

  const onResetPassword = async () => {
    resetMsgs();

    const eTrim = email.trim();
    if (!eTrim) {
      setError("Enter your email first, then click Reset password.");
      return;
    }

    setLoading(true);

    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(eTrim, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (resetErr) {
      setError(resetErr.message);
      setLoading(false);
      return;
    }

    setOk("Password reset email sent ✅");
    setLoading(false);
  };

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Sign in</h1>
      <p style={{ marginTop: 0, marginBottom: 14, opacity: 0.75 }}>
        Use email + password, or a magic link.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            resetMsgs();
          }}
          style={{
            padding: "8px 10px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: mode === "signin" ? "#111" : "white",
            color: mode === "signin" ? "white" : "#111",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Sign in
        </button>

        <button
          type="button"
          onClick={() => {
            setMode("signup");
            resetMsgs();
          }}
          style={{
            padding: "8px 10px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: mode === "signup" ? "#111" : "white",
            color: mode === "signup" ? "white" : "#111",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Sign up
        </button>

        <button
          type="button"
          onClick={() => {
            setMode("magic");
            resetMsgs();
          }}
          style={{
            padding: "8px 10px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: mode === "magic" ? "#111" : "white",
            color: mode === "magic" ? "white" : "#111",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Magic link
        </button>
      </div>

      {error && (
        <div style={{ background: "#ffe6e6", padding: 12, borderRadius: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {ok && (
        <div style={{ background: "#e8ffe8", padding: 12, borderRadius: 12, marginBottom: 12 }}>
          {ok}
        </div>
      )}

      <form
        onSubmit={mode === "signin" ? onSignIn : mode === "signup" ? onSignUp : onMagicLink}
        style={{ display: "grid", gap: 12 }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            style={{ padding: 10, borderRadius: 12, border: "1px solid #ccc" }}
          />
        </label>

        {mode !== "magic" ? (
          <label style={{ display: "grid", gap: 6 }}>
            <span>Password</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
              style={{ padding: 10, borderRadius: 12, border: "1px solid #ccc" }}
            />
          </label>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 12,
            borderRadius: 12,
            border: "none",
            fontWeight: 900,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading
            ? "Please wait…"
            : mode === "signin"
            ? "Sign in"
            : mode === "signup"
            ? "Create account"
            : "Send magic link"}
        </button>

        <button
          type="button"
          onClick={onResetPassword}
          disabled={loading}
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "white",
            fontWeight: 900,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          Reset password
        </button>

        <div style={{ fontSize: 13, opacity: 0.75 }}>
          After you confirm email / use the magic link, you’ll land on{" "}
          <b>/dashboard</b>.
        </div>

        <div style={{ fontSize: 13, opacity: 0.75 }}>
          Prefer a homepage?{" "}
          <Link href="/home" style={{ fontWeight: 800, textDecoration: "none" }}>
            Go to /home
          </Link>
        </div>
      </form>
    </main>
  );
}
