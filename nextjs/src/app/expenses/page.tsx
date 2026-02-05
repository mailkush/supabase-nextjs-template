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

type CategoriesRow = { id: string; name: string };
type AccountsRow = { id: string; name: string; type: string };

type QueryResult = { data: unknown[] | null; error: { message: string } | null };

type ExpenseQuery = {
  gte: (column: string, value: string) => {
    order: (column: string, opts: { ascending: boolean }) => Promise<QueryResult>;
  };
};

type SimpleQuery = {
  order: (column: string, opts: { ascending: boolean }) => Promise<QueryResult>;
};

type LooseSupabase = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string } | null } | null;
      error: { message: string } | null;
    }>;
  };
  from: (table: string) => {
    select: (columns: string) => SimpleQuery | ExpenseQuery;
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

      // categories
      const catQuery = supabase.from("categories").select("id,name") as SimpleQuery;
      const catRes = await catQuery.order("name", { ascending: true });
      if (catRes.error) {
        setError(`Could not load categories: ${catRes.error.message}`);
        setLoading(false);
        return;
      }

      // accounts
      const accQuery = supabase.from("accounts").select("id,name,type") as SimpleQuery;
      const accRes = await accQuery.order("name", { ascending: true });
      if (accRes.error) {
        setError(`Could not load accounts: ${accRes.error.message}`);
        setLoading(false);
        return;
      }

      const catRows = (catRes.data ?? []) as unknown as CategoriesRow[];
      const accRows = (accRes.data ?? []) as unknown as AccountsRow[];

      const catMap: Record<string, string> = {};
      catRows.forEach((c) => (catMap[c.id] = c.name));
      setCategories(catMap);

      const accMap: Record<string, string> = {};
      accRows.forEach((a) => (accMap[a.id] = `${a.name} (${a.type})`));
      setAccounts(accMap);

      // expenses (no created_at sort — only expense_date)
      const expQuery = supabase
        .from("expenses")
        .select("id,amount,description,expense_date,category_id,account_id") as ExpenseQuery;

      const expRes = await expQuery
        .gte("expense_date", fromDate)
        .order("expense_date", { ascending: false });

      if (expRes.error) {
        setError(`Could not load expenses: ${expRes.error.message}`);
        setLoading(false);
        return;
      }

      setExpenses((expRes.data ?? []) as unknown as ExpenseRow[]);
      setLoading(false);
    };

    load();
  }, [fromDate, supabase]);

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
            onChange={(e) => setRange(e.target.value as "7" | "30" | "90")}
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
          No expenses found in this range. <a href="/expenses/new">Add your first one</a>.
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
