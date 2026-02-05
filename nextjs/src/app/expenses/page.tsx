"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
type MutResult = { error: { message: string } | null };

type SimpleQuery = {
  order: (column: string, opts: { ascending: boolean }) => Promise<QueryResult>;
};

type ExpenseQuery = {
  gte: (column: string, value: string) => ExpenseQuery;
  lt: (column: string, value: string) => ExpenseQuery;
  eq: (column: string, value: string) => ExpenseQuery;
  order: (column: string, opts: { ascending: boolean }) => Promise<QueryResult>;
};

type DeleteQuery = {
  delete: () => {
    eq: (column: string, value: string) => Promise<MutResult>;
  };
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

type LooseSupabaseWithDelete = {
  from: (table: string) => DeleteQuery;
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
    const nextMonthDate = new Date(y, m, 1);
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
    return `₹${n}`;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function SwipeRow(props: {
  rowId: string;
  openRowId: string | null;
  setOpenRowId: (id: string | null) => void;

  children: React.ReactNode;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  const ACTION_W = 180;
  const THRESHOLD = 80;

  const isOpen = props.openRowId === props.rowId;

  const [dx, setDx] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  const startXRef = useRef<number | null>(null);
  const startDxRef = useRef<number>(0);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) setDx(0);
    if (isOpen) setDx(-ACTION_W);
  }, [isOpen]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (isDeleting) return;

    if (props.openRowId && props.openRowId !== props.rowId) {
      props.setOpenRowId(null);
    }

    startXRef.current = e.touches[0].clientX;
    startDxRef.current = dx;
    draggingRef.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!draggingRef.current || startXRef.current === null || isDeleting) return;
    const x = e.touches[0].clientX;
    const delta = x - startXRef.current;
    const next = clamp(startDxRef.current + delta, -ACTION_W, 0);
    setDx(next);
  };

  const onTouchEnd = () => {
    if (!draggingRef.current || isDeleting) return;
    draggingRef.current = false;

    if (dx < -THRESHOLD) {
      props.setOpenRowId(props.rowId);
      setDx(-ACTION_W);
    } else {
      props.setOpenRowId(null);
      setDx(0);
    }
  };

  const onTouchCancel = () => {
    draggingRef.current = false;
    if (!isDeleting) {
      props.setOpenRowId(null);
      setDx(0);
    }
  };

  const handleEdit = () => {
    if (isDeleting) return;
    props.setOpenRowId(null);
    props.onEdit();
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await props.onDelete();
    } finally {
      props.setOpenRowId(null);
      setDx(0);
      setIsDeleting(false);
    }
  };

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 14,
        border: "1px solid #e5e5e5",
        userSelect: "none",
      }}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: ACTION_W,
          display: "flex",
        }}
      >
        <button
          type="button"
          onClick={handleEdit}
          disabled={isDeleting}
          style={{
            width: 90,
            border: "none",
            cursor: isDeleting ? "not-allowed" : "pointer",
            fontWeight: 800,
            color: "white",
            background: "#2563eb",
          }}
        >
          Edit
        </button>

        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          style={{
            width: 90,
            border: "none",
            cursor: isDeleting ? "not-allowed" : "pointer",
            fontWeight: 800,
            color: "white",
            background: "#d11a2a",
          }}
        >
          {isDeleting ? "…" : "Delete"}
        </button>
      </div>

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        style={{
          transform: `translateX(${dx}px)`,
          transition: draggingRef.current ? "none" : "transform 160ms ease-out",
          background: "white",
          padding: 12,
          touchAction: "pan-y",
        }}
      >
        {props.children}
      </div>
    </div>
  );
}

export default function ExpensesListPage() {
  const [supabaseRaw] = useState(() => createSPAClient());
  const supabase = supabaseRaw as unknown as LooseSupabase;
  const supabaseDel = supabaseRaw as unknown as LooseSupabaseWithDelete;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [range, setRange] = useState<RangeOption>("30");

  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<Record<string, string>>({});

  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const computedBounds = useMemo(() => {
    if (range === "today") {
      const d = todayISODate();
      return { mode: "eq" as const, start: d, endExclusive: null as string | null };
    }
    if (range === "this_month") {
      const b = monthBoundsISO("this");
      return { mode: "between" as const, start: b.start, endExclusive: b.endExclusive };
    }
    if (range === "last_month") {
      const b = monthBoundsISO("last");
      return { mode: "between" as const, start: b.start, endExclusive: b.endExclusive };
    }
    const from = isoDaysAgo(Number(range));
    return { mode: "gte" as const, start: from, endExclusive: null as string | null };
  }, [range]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      setOpenRowId(null);

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user) {
        setError("You are not logged in. Please go to /auth/login and sign in.");
        setLoading(false);
        return;
      }

      const catQuery = supabase.from("categories").select("id,name") as SimpleQuery;
      const catRes = await catQuery.order("name", { ascending: true });
      if (catRes.error) {
        setError(`Could not load categories: ${catRes.error.message}`);
        setLoading(false);
        return;
      }

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

      const expQuery = supabase
        .from("expenses")
        .select("id,amount,description,expense_date,category_id,account_id") as ExpenseQuery;

      let expRes: QueryResult;

      if (computedBounds.mode === "eq") {
        expRes = await expQuery.eq("expense_date", computedBounds.start).order("expense_date", { ascending: false });
      } else if (computedBounds.mode === "between" && computedBounds.endExclusive) {
        expRes = await expQuery
          .gte("expense_date", computedBounds.start)
          .lt("expense_date", computedBounds.endExclusive)
          .order("expense_date", { ascending: false });
      } else {
        expRes = await expQuery.gte("expense_date", computedBounds.start).order("expense_date", { ascending: false });
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
  }, [computedBounds, supabase]);

  const total = useMemo(() => expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0), [expenses]);

  const deleteExpense = async (id: string) => {
    const prev = expenses;
    setExpenses((xs) => xs.filter((x) => x.id !== id));

    const res = await supabaseDel.from("expenses").delete().eq("id", id);
    if (res.error) {
      setExpenses(prev);
      setError(`Could not delete expense: ${res.error.message}`);
    }
  };

  const goEdit = (id: string) => {
    window.location.href = `/expenses/${id}`;
  };

  const closeOpenRow = () => {
    if (openRowId) setOpenRowId(null);
  };

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }} onClick={closeOpenRow} onTouchStart={closeOpenRow}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Expenses</h1>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href="/dashboard"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              fontWeight: 700,
              textDecoration: "none",
            }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            Dashboard
          </Link>

          <Link
            href="/expenses/new"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              fontWeight: 700,
              textDecoration: "none",
            }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            + Add
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>Range</span>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as RangeOption)}
            style={{ padding: 8, borderRadius: 10, border: "1px solid #ccc" }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <option value="today">Today</option>
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
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
        <div style={{ marginTop: 14, background: "#ffe6e6", padding: 12, borderRadius: 10 }}>{error}</div>
      ) : expenses.length === 0 ? (
        <div style={{ marginTop: 14, opacity: 0.8 }}>
          No expenses found in this range. <Link href="/expenses/new">Add your first one</Link>.
        </div>
      ) : (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {expenses.map((e) => (
            <SwipeRow
              key={e.id}
              rowId={e.id}
              openRowId={openRowId}
              setOpenRowId={setOpenRowId}
              onEdit={() => goEdit(e.id)}
              onDelete={() => deleteExpense(e.id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 800 }}>{formatINR(Number(e.amount) || 0)}</div>
                <div style={{ opacity: 0.7 }}>{e.expense_date}</div>
              </div>

              <div style={{ marginTop: 6, fontSize: 14 }}>
                <div style={{ fontWeight: 600 }}>{e.description?.trim() ? e.description : "(no description)"}</div>
                <div style={{ opacity: 0.8, marginTop: 4 }}>
                  Category: {e.category_id ? categories[e.category_id] || "—" : "—"}
                  <br />
                  Account: {accounts[e.account_id] || "—"}
                </div>
              </div>

              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.55 }}>
                Tip: Swipe left for Edit / Delete. Tap outside to close.
              </div>
            </SwipeRow>
          ))}
        </div>
      )}
    </main>
  );
}
