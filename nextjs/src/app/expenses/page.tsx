"use client";

import { useEffect, useMemo, useState } from "react";
import { createSPAClient } from "@/lib/supabase/client";

type ExpenseRow = {
  id: string;
  amount: number;
  description: string | null;
  expense_date: string; // YYYY-MM-DD
  category_id: string | null;
  account_id: string;
};

type Category = { id: string; name: string };
type Account = { id: string; name: string; type: string };

type LooseSupabase = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string } | null } | null;
      error: { message: string } | null;
    }>;
  };
  from: (table: string) => {
    select: (columns: string) => {
      eq?: (col: string, val: string) => any; // unused here
      gte?: (col: string, val: string) => any;
      order?: (col: string, opts: { ascending: boolean }) => any;
      limit?: (n: number) => any;
      // We will rely on chaining returning a promise at the end.
      then?: any;
    };
  };
};

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatINR(n: number) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `₹${n}`;
  }
}

export default function ExpensesListPage() {
  const [supabaseRaw] = useState(() => createSPAClient());
  const supabase = supabaseRaw as unknown as LooseSupabase;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [range, setRange] = useState<"7" | "30" | "90">("30");

  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<Record<string, string>>({});

  const fromDate = useMemo(() => isoDaysAgo(Number(range)), [range]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user) {
        setError("You are not logged in. Please go to /auth/login and sign in.");
        setLoading(false);
        return;
      }

      // Use a very lightweight "any-less" approach (template DB types don't include our tables yet)
      const sb: any = supabaseRaw;

      // 1) Load lookup tables (categories + accounts)
      const [{ data: catData, error: catErr }, { data: accData, error: accErr }] =
        await Promise.all([
          sb.from("categories").select("id,name").order("name", { ascending: true }),
          sb.from("accounts").select("id,name,type").order("name", { ascending: true }),
        ]);

      if (catErr) {
        setError(`Could not load categories: ${catErr.message}`);
        setLoading(false);
        return;
      }
      if (accErr) {
        setError(`Could not load accounts: ${accErr.message}`);
        setLoading(false);
        return;
      }

      const catMap: Record<string, string> = {};
      (catData ?? []).forEach((c: any) => (catMap[c.id] = c.name));

      const accMap: Record<string, string> = {};
      (accData ?? []).forEach((a: any) => (accMap[a.id] = `${a.name} (${a.type})`));

      setCategories(catMap);
      setAccounts(accMap);

      // 2) Load expenses (last N days)
      const { data: expData, error: expErr } = await sb
        .from("expenses")
        .select("id,amount,description,expense_date,category_id,account_id")
        .gte("expense_date", fromDate)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (expErr) {
        setError(`Could not load expenses: ${expErr.message}`);
        setLoading(false);
        return;
      }

      setExpenses((expData ?? []) as ExpenseRow[]);
      setLoading(false);
    };

    load();
  }, [fromDate, supabase, supabaseRaw]);

  const total = useMemo(
    () => expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [expenses]
  );

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Expenses</h1>

        <a
          href="/expenses/new"
          style={{
            marginLeft: "auto",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          + Add Expense
        </a>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>Range</span>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as any)}
            style={{ padding: 8, borderRadius: 10, border: "1px solid #ccc" }}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </label>

        <div style={{ marginLeft: "auto", opacity: 0.8 }}>
          Total: <b>{formatINR(total)}</b>
        </div>
      </div>

      {loading ? (
        <p style={{ marginTop: 14 }}>Loading…</p>
      ) : error ? (
        <div
          style={{
            marginTop: 14,
            background: "#ffe6e6",
            padding: 12,
            borderRadius: 10,
          }}
        >
          {error}
        </div>
      ) : expenses.length === 0 ? (
        <div style={{ marginTop: 14, opacity: 0.8 }}>
          No expenses found in this range.{" "}
          <a href="/expenses/new">Add your first one</a>.
        </div>
      ) : (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {expenses.map((e) => (
            <div
              key={e.id}
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 14,
                padding: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 700 }}>{formatINR(Number(e.amount) || 0)}</div>
                <div style={{ opacity: 0.7 }}>{e.expense_date}</div>
              </div>

              <div style={{ marginTop: 6, fontSize: 14 }}>
                <div style={{ fontWeight: 600 }}>
                  {e.description?.trim() ? e.description : "(no description)"}
                </div>
                <div style={{ opacity: 0.8, marginTop: 4 }}>
                  Category: {e.category_id ? categories[e.category_id] || "—" : "—"}
                  <br />
                  Account: {accounts[e.account_id] || "—"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
