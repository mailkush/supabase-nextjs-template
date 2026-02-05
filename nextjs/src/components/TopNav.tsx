"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSPAClient } from "@/lib/supabase/client";

export default function TopNav() {
  const router = useRouter();
  const supabase = createSPAClient();

  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data?.user?.email ?? null);
    };
    run();
  }, [supabase]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/auth/login");
  };

  return (
    <div
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
          maxWidth: 820,
          margin: "0 auto",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 900 }}>Expense Tracker</div>

        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/dashboard" style={{ textDecoration: "none", fontWeight: 700 }}>
            Dashboard
          </Link>
          <Link href="/expenses" style={{ textDecoration: "none", fontWeight: 700 }}>
            Expenses
          </Link>
          <Link href="/expenses/new" style={{ textDecoration: "none", fontWeight: 700 }}>
            Add
          </Link>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{email ?? ""}</div>

          <Link
            href="/account"
            style={{
              textDecoration: "none",
              fontWeight: 800,
              border: "1px solid #ddd",
              padding: "8px 10px",
              borderRadius: 12,
            }}
          >
            Account
          </Link>

          <button
            type="button"
            onClick={logout}
            style={{
              fontWeight: 800,
              border: "1px solid #ddd",
              padding: "8px 10px",
              borderRadius: 12,
              background: "white",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
