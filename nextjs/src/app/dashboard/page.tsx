"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSPAClient } from "@/lib/supabase/client";

type ExpenseRow = {
  id: string;
  amount: number;
  expense_date: string; // YYYY-MM-DD
  category_id: string | null;
  account_id: string;
};

type CategoriesRow = { id: string; name: string };
type AccountsRow = { id: string; name: string; type: string };

type AuthResult = {
  data: { user: { id: string } | null } | null;
  error: { message: string } | null;
};

type ManyResult = { data: unknown[] | null; error: { message: string } | null };

type SimpleQuery = {
  order: (column: string, opts: { ascending: boolean }) => Promise<ManyResult>;
};

type ExpenseQuery = {
  gte: (column: string, value: string) => ExpenseQuery;
  lt: (column: string, value: string) => ExpenseQuery;
  eq: (column: string, value: string) => ExpenseQuery;
  order: (column: string, opts: { ascending: boolean }) => Promise<ManyResult>;
};

type LooseSupabase = {
  auth: { getUser: () => Promise<AuthResult> };
  from: (table: string) => {
    select: (columns: string) => SimpleQuery | ExpenseQuery;
  };
};

type RangeOption = "today" | "this_month" | "last_month" | "7" | "30" | "90";

function todayISODate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function firstDayOfMonthISO(year: number, month1to12: number) {
  const mm = String(month1to12).padStart(2, "0");
  return `${year}-${mm}-01`;
}

function monthBoundsISO(which: "this" | "last") {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12

  if (which === "this") {
    const start = firstDayOfMonthISO(y, m);
    const nextMonthDate = new Date(y, m, 1); // y,m => next month
    const ny = nextMonthDate.getFullYear();
    const nm = nextMonthDate.getMonth() + 1;
    const endExclusive = firstDayOfMonthISO(ny, nm);
    return { start, endExclusive };
  }

  const lastMonthDate = new Date(y, m - 2, 1);
  const ly = lastMonthDate.getFullYear();
  const lm = lastMonthDate.getMonth() + 1;

  const start = firstDayOfMonthISO(ly, lm);
  const endExclusive = firstDayOfMonthISO(y, m);
  return { start, endExclusive };
}

function formatINR(n: number) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `₹${Math.round(n)}`;
  }
}

function sumAmounts(rows: ExpenseRow[]) {
  return rows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
}

function addDaysISO(iso: string, add: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + add);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function compareISO(a: string, b: string) {
  // lex compare works for YYYY-MM-DD
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function endInclusiveFromEndExclusive(endExclusive: string) {
  const d = new Date(`${endExclusive}T00:00:00`);
  d.setDate(d.getDate() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function topBuckets(
  rows: ExpenseRow[],
  getKey: (r: ExpenseRow) => string,
  getLabel: (key: string) => string,
  topN: number
) {
  const map: Record<string, number> = {};
  for (const r of rows) {
    const key = getKey(r);
    map[key] = (map[key] || 0) + (Number(r.amount) || 0);
  }

  const items = Object.entries(map)
    .map(([key, total]) => ({ key, label: getLabel(key), total }))
    .sort((a, b) => b.total - a.total);

  const top = items.slice(0, topN);
  const rest = items.slice(topN);
  const othersTotal = rest.reduce((acc, x) => acc + x.total, 0);

  return {
    top,
    othersTotal,
    total: items.reduce((acc, x) => acc + x.total, 0),
  };
}

function BarRow(props: { label: string; value: number; max: number }) {
  const pct = props.max > 0 ? Math.round((props.value / props.max) * 100) : 0;

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 650 }}>{props.label}</div>
        <div style={{ opacity: 0.85 }}>{formatINR(props.value)}</div>
      </div>
      <div style={{ height: 10, background: "#f1f1f1", borderRadius: 999 }}>
        <div
          style={{
            height: 10,
            width: `${Math.min(100, Math.max(0, pct))}%`,
            background: "#111",
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  );
}

function Card(props: { title: string; value: string; subtitle?: string }) {
  return (
    <div
      style={{
        border: "1px solid #e7e7e7",
        borderRadius: 16,
        padding: 12,
        background: "white",
      }}
    >
      <div style={{ fontSize: 13, opacity: 0.7, fontWeight: 700 }}>{props.title}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{props.value}</div>
      {props.subtitle ? (
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{props.subtitle}</div>
      ) : null}
    </div>
  );
}

function TrendRow(props: { date: string; value: number; max: number }) {
  const pct = props.max > 0 ? Math.round((props.value / props.max) * 100) : 0;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 650 }}>{props.date}</div>
        <div style={{ opacity: 0.85 }}>{formatINR(props.value)}</div>
      </div>
      <div style={{ height: 8, background: "#f1f1f1", borderRadius: 999 }}>
        <div
          style={{
            height: 8,
            width: `${Math.min(100, Math.max(0, pct))}%`,
            background: "#111",
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();

  const [supabaseRaw] = useState(() => createSPAClient());
  const supabase = supabaseRaw as unknown as LooseSupabase;

  const [range, setRange] = useState<RangeOption>("this_month");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [catMap, setCatMap] = useState<Record<string, string>>({});
  const [accMap, setAccMap] = useState<Record<string, string>>({});

  const computedBounds = useMemo(() => {
    if (range === "today") {
      const d = todayISODate();
      return { mode: "eq" as const, start: d, endExclusive: null as string | null, label: "Today" };
    }
    if (range === "this_month") {
      const b = monthBoundsISO("this");
      return { mode: "between" as const, start: b.start, endExclusive: b.endExclusive, label: "This month" };
    }
    if (range === "last_month") {
      const b = monthBoundsISO("last");
      return { mode: "between" as const, start: b.start, endExclusive: b.endExclusive, label: "Last month" };
    }
    const from = isoDaysAgo(Number(range));
    return { mode: "gte" as const, start: from, endExclusive: null as string | null, label: `Last ${range} days` };
  }, [range]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user) {
        router.push("/auth/login");
        return;
      }

      const catQ = supabase.from("categories").select("id,name") as SimpleQuery;
      const catRes = await catQ.order("name", { ascending: true });
      if (catRes.error) {
        setError(`Could not load categories: ${catRes.error.message}`);
        setLoading(false);
        return;
      }
      const cats = (catRes.data ?? []) as unknown as CategoriesRow[];
      const cm: Record<string, string> = {};
      for (const c of cats) cm[c.id] = c.name;
      setCatMap(cm);

      const accQ = supabase.from("accounts").select("id,name,type") as SimpleQuery;
      const accRes = await accQ.order("name", { ascending: true });
      if (accRes.error) {
        setError(`Could not load accounts: ${accRes.error.message}`);
        setLoading(false);
        return;
      }
      const accs = (accRes.data ?? []) as unknown as AccountsRow[];
      const am: Record<string, string> = {};
      for (const a of accs) am[a.id] = `${a.name} (${a.type})`;
      setAccMap(am);

      const expQ = supabase
        .from("expenses")
        .select("id,amount,expense_date,category_id,account_id") as ExpenseQuery;

      let expRes: ManyResult;

      if (computedBounds.mode === "eq") {
        expRes = await expQ.eq("expense_date", computedBounds.start).order("expense_date", { ascending: false });
      } else if (computedBounds.mode === "between" && computedBounds.endExclusive) {
        expRes = await expQ
          .gte("expense_date", computedBounds.start)
          .lt("expense_date", computedBounds.endExclusive)
          .order("expense_date", { ascending: false });
      } else {
        expRes = await expQ.gte("expense_date", computedBounds.start).order("expense_date", { ascending: false });
      }

      if (expRes.error) {
        setError(`Could not load expenses: ${expRes.error.message}`);
        setLoading(false);
        return;
      }

      setExpenses((expRes.data ?? []) as unknown as ExpenseRow[]);
      setLoading(false);
    };

    load();
  }, [computedBounds, router, supabase]);

  const totalSpend = useMemo(() => sumAmounts(expenses), [expenses]);
  const txCount = expenses.length;

  const daysInRange = useMemo(() => {
    if (range === "today") return 1;

    if (computedBounds.mode === "between" && computedBounds.endExclusive) {
      const endISO = endInclusiveFromEndExclusive(computedBounds.endExclusive);
      // inclusive days between start & end
      const s = new Date(`${computedBounds.start}T00:00:00`).getTime();
      const e = new Date(`${endISO}T00:00:00`).getTime();
      const days = Math.floor((e - s) / (24 * 60 * 60 * 1000)) + 1;
      return Math.max(1, days);
    }

    const n = Number(range);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [computedBounds, range]);

  const avgPerDay = daysInRange > 0 ? totalSpend / daysInRange : totalSpend;

  const byCategory = useMemo(() => {
    const uncKey = "__uncat__";
    return topBuckets(
      expenses,
      (r) => (r.category_id ? r.category_id : uncKey),
      (key) => (key === uncKey ? "Uncategorised" : catMap[key] || "Unknown category"),
      8
    );
  }, [expenses, catMap]);

  const byAccount = useMemo(() => {
    return topBuckets(
      expenses,
      (r) => r.account_id,
      (key) => accMap[key] || "Unknown account",
      8
    );
  }, [expenses, accMap]);

  const maxCat = useMemo(() => Math.max(byCategory.top.reduce((m, x) => Math.max(m, x.total), 0), byCategory.othersTotal), [
    byCategory,
  ]);

  const maxAcc = useMemo(() => Math.max(byAccount.top.reduce((m, x) => Math.max(m, x.total), 0), byAccount.othersTotal), [
    byAccount,
  ]);

  // ---- Daily trend (fills missing days with 0) ----
  const trend = useMemo(() => {
    const sumByDate: Record<string, number> = {};
    for (const e of expenses) {
      const d = e.expense_date;
      sumByDate[d] = (sumByDate[d] || 0) + (Number(e.amount) || 0);
    }

    const start = computedBounds.start;
    let endInclusive: string;

    if (computedBounds.mode === "eq") {
      endInclusive = start;
    } else if (computedBounds.mode === "between" && computedBounds.endExclusive) {
      endInclusive = endInclusiveFromEndExclusive(computedBounds.endExclusive);
    } else {
      // gte mode for last N days: include from->today
      endInclusive = todayISODate();
    }

    // build ordered list
    const out: { date: string; total: number }[] = [];
    let cur = start;

    // safety cap to avoid infinite loops
    let guard = 0;
    while (compareISO(cur, endInclusive) <= 0 && guard < 370) {
      out.push({ date: cur, total: sumByDate[cur] || 0 });
      cur = addDaysISO(cur, 1);
      guard += 1;
    }

    return out;
  }, [expenses, computedBounds]);

  const maxTrend = useMemo(() => trend.reduce((m, x) => Math.max(m, x.total), 0), [trend]);

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Dashboard</h1>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href="/expenses"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              fontWeight: 800,
              textDecoration: "none",
            }}
          >
            View expenses
          </Link>

          <Link
            href="/expenses/new"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              fontWeight: 800,
              textDecoration: "none",
            }}
          >
            + Add
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ opacity: 0.8 }}>Range</span>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as RangeOption)}
            style={{ padding: 8, borderRadius: 10, border: "1px solid #ccc" }}
          >
            <option value="today">Today</option>
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </label>

        <div style={{ marginLeft: "auto", opacity: 0.75, fontSize: 13 }}>
          Showing: <b>{computedBounds.label}</b>
        </div>
      </div>

      {loading ? (
        <p style={{ marginTop: 14 }}>Loading…</p>
      ) : error ? (
        <div style={{ marginTop: 14, background: "#ffe6e6", padding: 12, borderRadius: 10 }}>{error}</div>
      ) : (
        <>
          <div
            style={{
              marginTop: 14,
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            }}
          >
            <Card title="Total spend" value={formatINR(totalSpend)} subtitle={`${txCount} transactions`} />
            <Card title="Avg per day" value={formatINR(avgPerDay)} subtitle={`${daysInRange} day(s) in range`} />
            <Card title="Transactions" value={`${txCount}`} subtitle="Count in selected range" />
          </div>

          {/* Daily Trend */}
          <div style={{ marginTop: 14, border: "1px solid #e7e7e7", borderRadius: 16, padding: 12, background: "white" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Daily trend</h2>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Spend per day</div>
            </div>

            {trend.length === 0 ? (
              <div style={{ marginTop: 10, opacity: 0.7 }}>No data.</div>
            ) : (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {/* For long ranges, show only last 31 days to keep it readable */}
                {(trend.length > 31 ? trend.slice(-31) : trend).map((t) => (
                  <TrendRow key={t.date} date={t.date} value={t.total} max={maxTrend} />
                ))}

                {trend.length > 31 ? (
                  <div style={{ marginTop: 4, fontSize: 12, opacity: 0.65 }}>
                    Showing last 31 days of the selected range.
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <div style={{ border: "1px solid #e7e7e7", borderRadius: 16, padding: 12, background: "white" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>By category</h2>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Top 8 + Others</div>
              </div>

              {expenses.length === 0 ? (
                <div style={{ marginTop: 10, opacity: 0.7 }}>No expenses in this range.</div>
              ) : (
                <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                  {byCategory.top.map((x) => (
                    <BarRow key={x.key} label={x.label} value={x.total} max={maxCat} />
                  ))}
                  {byCategory.othersTotal > 0 ? <BarRow label="Others" value={byCategory.othersTotal} max={maxCat} /> : null}
                </div>
              )}
            </div>

            <div style={{ border: "1px solid #e7e7e7", borderRadius: 16, padding: 12, background: "white" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>By account</h2>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Top 8 + Others</div>
              </div>

              {expenses.length === 0 ? (
                <div style={{ marginTop: 10, opacity: 0.7 }}>No expenses in this range.</div>
              ) : (
                <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                  {byAccount.top.map((x) => (
                    <BarRow key={x.key} label={x.label} value={x.total} max={maxAcc} />
                  ))}
                  {byAccount.othersTotal > 0 ? <BarRow label="Others" value={byAccount.othersTotal} max={maxAcc} /> : null}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
