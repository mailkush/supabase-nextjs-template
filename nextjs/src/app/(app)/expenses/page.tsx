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
  is: (column: string, value: null) => ExpenseQuery;
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

type RangeOption = "all" | "today" | "this_month" | "last_month" | "7" | "30" | "90";
type CatToken = "uncat" | string;

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
  const m = now.getMonth() + 1;

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

function norm(s: string) {
  return s.trim().toLowerCase();
}

function safeIncludes(haystack: string, needle: string) {
  if (!needle) return true;
  return norm(haystack).includes(norm(needle));
}

// ✅ no `any` here (passes @typescript-eslint/no-explicit-any)
function useIsTouchLike() {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const nav = navigator as unknown as Record<string, unknown>;
    const msMaxTouchPoints = typeof nav.msMaxTouchPoints === "number" ? (nav.msMaxTouchPoints as number) : 0;

    const touchCapable = navigator.maxTouchPoints > 0 || "ontouchstart" in window || msMaxTouchPoints > 0;

    setIsTouch(Boolean(touchCapable));
  }, []);

  return isTouch;
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
  const startYRef = useRef<number | null>(null);
  const startDxRef = useRef<number>(0);
  const draggingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const wheelAccumRef = useRef(0);

  useEffect(() => {
    if (!isOpen) setDx(0);
    if (isOpen) setDx(-ACTION_W);
  }, [isOpen]);

  const settle = (nextDx: number) => {
    if (nextDx < -THRESHOLD) {
      props.setOpenRowId(props.rowId);
      setDx(-ACTION_W);
    } else {
      props.setOpenRowId(null);
      setDx(0);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (isDeleting) return;

    if (props.openRowId && props.openRowId !== props.rowId) {
      props.setOpenRowId(null);
    }

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}

    pointerIdRef.current = e.pointerId;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    startDxRef.current = dx;
    draggingRef.current = true;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    if (pointerIdRef.current !== e.pointerId) return;
    if (startXRef.current === null || startYRef.current === null || isDeleting) return;

    const deltaX = e.clientX - startXRef.current;
    const deltaY = e.clientY - startYRef.current;

    // If user is clearly scrolling vertically, don't treat it as a swipe.
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) return;

    const next = clamp(startDxRef.current + deltaX, -ACTION_W, 0);
    setDx(next);
  };

  const onPointerUpOrCancel = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;

    draggingRef.current = false;
    pointerIdRef.current = null;
    startXRef.current = null;
    startYRef.current = null;

    if (isDeleting) return;
    settle(dx);
  };

  // Trackpad two-finger horizontal swipe often comes as WheelEvent deltaX
  const onWheel = (e: React.WheelEvent) => {
    if (isDeleting) return;

    if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    if (Math.abs(e.deltaX) < 6) return;

    e.preventDefault();

    if (props.openRowId && props.openRowId !== props.rowId) {
      props.setOpenRowId(null);
    }

    wheelAccumRef.current += e.deltaX;

    // subtract deltaX so "swipe left" opens actions
    const nextDx = clamp(dx - e.deltaX, -ACTION_W, 0);
    setDx(nextDx);

    if (Math.abs(wheelAccumRef.current) > THRESHOLD) {
      wheelAccumRef.current = 0;
      settle(nextDx);
    }
  };

  const handleEdit = () => {
    if (isDeleting) return;
    props.setOpenRowId(null);
    setDx(0);
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
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUpOrCancel}
        onPointerCancel={onPointerUpOrCancel}
        onWheel={onWheel}
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

  const isTouchLike = useIsTouchLike();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [range, setRange] = useState<RangeOption>("30");
  const [selectedCats, setSelectedCats] = useState<CatToken[]>([]);
  const [search, setSearch] = useState("");

  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [categoryOptions, setCategoryOptions] = useState<CategoriesRow[]>([]);
  const [accounts, setAccounts] = useState<Record<string, string>>({});

  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const computedBounds = useMemo(() => {
    if (range === "all") {
      return { mode: "all" as const, start: null as string | null, endExclusive: null as string | null };
    }
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
      setCategoryOptions(catRows);

      const accMap: Record<string, string> = {};
      accRows.forEach((a) => (accMap[a.id] = `${a.name} (${a.type})`));
      setAccounts(accMap);

      const expQueryBase = supabase
        .from("expenses")
        .select("id,amount,description,expense_date,category_id,account_id") as ExpenseQuery;

      let expQuery: ExpenseQuery = expQueryBase;

      if (computedBounds.mode === "all") {
        // no-op
      } else if (computedBounds.mode === "eq" && computedBounds.start) {
        expQuery = expQuery.eq("expense_date", computedBounds.start);
      } else if (computedBounds.mode === "between" && computedBounds.start && computedBounds.endExclusive) {
        expQuery = expQuery.gte("expense_date", computedBounds.start).lt("expense_date", computedBounds.endExclusive);
      } else if (computedBounds.mode === "gte" && computedBounds.start) {
        expQuery = expQuery.gte("expense_date", computedBounds.start);
      }

      const expRes = await expQuery.order("expense_date", { ascending: false });

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

  const toggleCat = (token: CatToken) => {
    setSelectedCats((prev) => {
      const has = prev.includes(token);
      return has ? prev.filter((x) => x !== token) : [...prev, token];
    });
  };

  const clearCats = () => setSelectedCats([]);

  const filteredExpenses = useMemo(() => {
    const s = norm(search);

    const catActive = selectedCats.length > 0;
    const allowUncat = selectedCats.includes("uncat");
    const allowIds = new Set(selectedCats.filter((x) => x !== "uncat"));

    return expenses.filter((e) => {
      if (catActive) {
        if (e.category_id === null) {
          if (!allowUncat) return false;
        } else {
          if (!allowIds.has(e.category_id)) return false;
        }
      }

      if (!s) return true;

      const amountStr = String(Number(e.amount) || 0);
      const desc = e.description ?? "";
      const acc = accounts[e.account_id] ?? "";

      return safeIncludes(amountStr, s) || safeIncludes(desc, s) || safeIncludes(acc, s);
    });
  }, [expenses, selectedCats, search, accounts]);

  const total = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [filteredExpenses]
  );

  const deleteExpense = async (id: string) => {
    const prevAll = expenses;
    setExpenses((xs) => xs.filter((x) => x.id !== id));

    const res = await supabaseDel.from("expenses").delete().eq("id", id);
    if (res.error) {
      setExpenses(prevAll);
      setError(`Could not delete expense: ${res.error.message}`);
    }
  };

  const goEdit = (id: string) => {
    window.location.href = `/expenses/${id}`;
  };

  const closeOpenRow = () => {
    if (openRowId) setOpenRowId(null);
  };

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 10px",
    borderRadius: 999,
    border: "1px solid #ddd",
    background: active ? "#111" : "white",
    color: active ? "white" : "#111",
    fontWeight: 800,
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  });

  const desktopHint =
    !isTouchLike
      ? "Tip: Drag left (mouse) or two-finger swipe (trackpad) for Edit / Delete. Click outside to close."
      : null;

  return (
    <main onClick={closeOpenRow} onTouchStart={closeOpenRow}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Range</span>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as RangeOption)}
              style={{ padding: 8, borderRadius: 10, border: "1px solid #ccc" }}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <option value="all">All time</option>
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

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ flex: 1, minWidth: 220, display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.75 }}>Search (amount, description, account)</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. 500, dinner, HDFC…"
              style={{
                padding: 10,
                borderRadius: 12,
                border: "1px solid #ccc",
                background: "white",
              }}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            />
          </label>

          {search.trim() ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSearch("");
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ddd",
                background: "white",
                fontWeight: 800,
                cursor: "pointer",
                height: 42,
                alignSelf: "end",
              }}
            >
              Clear
            </button>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, opacity: 0.75, marginRight: 4 }}>Categories</span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearCats();
            }}
            style={chipStyle(selectedCats.length === 0)}
          >
            All
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleCat("uncat");
            }}
            style={chipStyle(selectedCats.includes("uncat"))}
          >
            Uncategorised
          </button>

          {categoryOptions.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleCat(c.id);
              }}
              style={chipStyle(selectedCats.includes(c.id))}
            >
              {c.name}
            </button>
          ))}
        </div>

        {(selectedCats.length > 0 || search.trim()) && (
          <div style={{ fontSize: 12, opacity: 0.65 }}>
            Showing <b>{filteredExpenses.length}</b> of <b>{expenses.length}</b> expenses
          </div>
        )}

        {desktopHint ? <div style={{ fontSize: 12, opacity: 0.55 }}>{desktopHint}</div> : null}
      </div>

      {loading ? (
        <p style={{ marginTop: 14 }}>Loading…</p>
      ) : error ? (
        <div style={{ marginTop: 14, background: "#ffe6e6", padding: 12, borderRadius: 10 }}>{error}</div>
      ) : filteredExpenses.length === 0 ? (
        <div style={{ marginTop: 14, opacity: 0.8 }}>
          No expenses found with these filters. <Link href="/expenses/new">Add a new one</Link>.
        </div>
      ) : (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {filteredExpenses.map((e) => (
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

              {isTouchLike ? (
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.55 }}>
                  Tip: Swipe left for Edit / Delete. Tap outside to close.
                </div>
              ) : null}
            </SwipeRow>
          ))}
        </div>
      )}
    </main>
  );
}
