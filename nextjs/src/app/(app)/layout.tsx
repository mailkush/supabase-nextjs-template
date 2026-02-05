"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  // Close menu on outside click / tap / Escape
  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!menuRef.current) return;
      const target = e.target as Node | null;
      if (target && !menuRef.current.contains(target)) setMenuOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setMenuOpen(false);
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
        Please wait Dhruvi, this takes time sometimes…
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

          {/* Menu button (3 dots) */}
          <div style={{ marginLeft: "auto", position: "relative" }} ref={menuRef}>
            <button
              type="button"
              aria-label="Menu"
              onClick={() => setMenuOpen((v) => !v)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                border: "1px solid #ddd",
                background: "white",
                cursor: "pointer",
                fontWeight: 900,
                display: "grid",
                placeItems: "center",
              }}
            >
              ⋯
            </button>

            {menuOpen ? (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: 46,
                  width: 260,
                  background: "white",
                  border: "1px solid #eee",
                  borderRadius: 14,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.10)",
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                  Signed in as
                </div>
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 13,
                    wordBreak: "break-word",
                    marginBottom: 10,
                  }}
                >
                  {email ?? ""}
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <button
                    type="button"
                    onClick={logout}
                    disabled={loggingOut}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      background: "white",
                      fontWeight: 900,
                      cursor: loggingOut ? "not-allowed" : "pointer",
                      textAlign: "left",
                    }}
                  >
                    {loggingOut ? "Logging out…" : "Logout"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "16px 16px 40px" }}>
        {children}
      </div>
    </div>
  );
}
