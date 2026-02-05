"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSPAClient } from "@/lib/supabase/client";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        fontWeight: 900,
        padding: "8px 10px",
        borderRadius: 12,
        border: "1px solid #ddd",
        background: active ? "#111" : "white",
        color: active ? "white" : "#111",
      }}
    >
      {label}
    </Link>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const supabase = useMemo(() => createSPAClient(), []);

  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const run = async () => {
      setChecking(true);
      const { data, error } = await supabase.auth.getUser();

      if (error || !data?.user) {
        router.replace("/auth/login");
        return;
      }

      setEmail(data.user.email ?? null);
      setChecking(false);
    };

    run();
  }, [router, supabase]);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.replace("/auth/login");
  };

  if (checking) {
    return (
      <main
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          opacity: 0.7,
        }}
      >
        Loading…
      </main>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "white",
          borderBottom: "1px solid #eee",
        }}
      >
        <div
          style={{
            maxWidth: 920,
            margin: "0 auto",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 950, marginRight: 8 }}>Expense Tracker</div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <NavLink href="/dashboard" label="Dashboard" />
            <NavLink href="/expenses" label="Expenses" />
            <NavLink href="/expenses/new" label="+ Add" />
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>{email ?? ""}</div>

            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              style={{
                fontWeight: 900,
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid #ddd",
                background: "white",
                cursor: loggingOut ? "not-allowed" : "pointer",
              }}
            >
              {loggingOut ? "…" : "Logout"}
            </button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "16px 16px 40px" }}>
        {children}
      </div>
    </div>
  );
}
