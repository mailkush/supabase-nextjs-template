"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSPAClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSPAClient(), []);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Verify the recovery session exists (otherwise link is invalid/expired)
  useEffect(() => {
    const run = async () => {
      setChecking(true);
      setError(null);

      const { data, error: sessionErr } = await supabase.auth.getSession();

      if (sessionErr) {
        setError(sessionErr.message);
        setChecking(false);
        return;
      }

      if (!data?.session) {
        setError("Invalid or expired reset link. Please request a new reset email.");
        setChecking(false);
        return;
      }

      setChecking(false);
    };

    run();
  }, [supabase]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);

    const { error: updErr } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updErr) {
      setError(updErr.message);
      setSaving(false);
      return;
    }

    setOk("Password updated ✅ Redirecting…");
    setSaving(false);

    // Small pause so user sees the confirmation
    setTimeout(() => {
      router.replace("/dashboard");
    }, 800);
  };

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Reset password</h1>
      <p style={{ marginTop: 0, marginBottom: 16, opacity: 0.75 }}>
        Choose a new password for your account.
      </p>

      {checking ? (
        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, opacity: 0.8 }}>
          Checking reset link…
        </div>
      ) : (
        <>
          {error && (
            <div style={{ background: "#ffe6e6", padding: 12, borderRadius: 12, marginBottom: 12 }}>
              {error}
              <div style={{ marginTop: 10 }}>
                <Link href="/auth/login" style={{ fontWeight: 800, textDecoration: "none" }}>
                  Back to login
                </Link>
              </div>
            </div>
          )}

          {ok && (
            <div style={{ background: "#e8ffe8", padding: 12, borderRadius: 12, marginBottom: 12 }}>
              {ok}
            </div>
          )}

          {!error ? (
            <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>New password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  style={{ padding: 10, borderRadius: 12, border: "1px solid #ccc" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Confirm new password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{ padding: 10, borderRadius: 12, border: "1px solid #ccc" }}
                />
              </label>

              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "none",
                  fontWeight: 900,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Updating…" : "Update password"}
              </button>

              <div style={{ fontSize: 13, opacity: 0.75 }}>
                Remembered your password?{" "}
                <Link href="/auth/login" style={{ fontWeight: 800, textDecoration: "none" }}>
                  Sign in
                </Link>
              </div>
            </form>
          ) : null}
        </>
      )}
    </main>
  );
}
