"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSPAClient } from "@/lib/supabase/client";

type Category = { id: string; name: string };
type Account = { id: string; name: string; type: string };

type ExpenseRow = {
  id: string;
  amount: number;
  description: string | null;
  expense_date: string;
  category_id: string | null;
  account_id: string;
};

type AuthResult = {
  data: { user: { id: string } | null } | null;
  error: { message: string } | null;
};

type ManyResult = { data: unknown[] | null; error: { message: string } | null };
type OneResult = { data: unknown | null; error: { message: string } | null };
type MutResult = { error: { message: string } | null };

type SimpleQuery = {
  order: (column: string, opts: { ascending: boolean }) => Promise<ManyResult>;
};

type ExpenseGetQuery = {
  eq: (column: string, value: string) => {
    single: () => Promise<OneResult>;
  };
};

type ExpenseUpdateQuery = {
  update: (values: Record<string, unknown>) => {
    eq: (column: string, value: string) => Promise<MutResult>;
  };
};

type LooseSupabase = {
  auth: { getUser: () => Promise<AuthResult> };
  from: (table: string) => {
    select: (columns: string) => SimpleQuery | ExpenseGetQuery;
  };
};

type LooseSupabaseUpdate = {
  from: (table: string) => ExpenseUpdateQuery;
};

export default function EditExpensePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [supabaseRaw] = useState(() => createSPAClient());
  const supabase = supabaseRaw as unknown as LooseSupabase;
  const supabaseUpd = supabaseRaw as unknown as LooseSupabaseUpdate;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [expenseDate, setExpenseDate] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      setOk(null);

      if (!id) {
        setError("Missing expense id.");
        setLoading(false);
        return;
      }

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user) {
        setError("You are not logged in. Please go to /auth/login and sign in.");
        setLoading(false);
        return;
      }

      // Load categories
      const catQ = supabase.from("categories").select("id,name") as SimpleQuery;
      const catRes = await catQ.order("name", { ascending: true });
      if (catRes.error) {
        setError(`Could not load categories: ${catRes.error.message}`);
        setLoading(false);
        return;
      }
      setCategories((catRes.data ?? []) as unknown as Category[]);

      // Load accounts
      const accQ = supabase.from("accounts").select("id,name,type") as SimpleQuery;
      const accRes = await accQ.order("name", { ascending: true });
      if (accRes.error) {
        setError(`Could not load accounts: ${accRes.error.message}`);
        setLoading(false);
        return;
      }
      setAccounts((accRes.data ?? []) as unknown as Account[]);

      // Load the expense (RLS should ensure only your row is visible)
      const expQ = supabase
        .from("expenses")
        .select("id,amount,description,expense_date,category_id,account_id") as ExpenseGetQuery;

      const expRes = await expQ.eq("id", id).single();

      if (expRes.error || !expRes.data) {
        setError(`Could not load expense: ${expRes.error?.message || "Not found"}`);
        setLoading(false);
        return;
      }

      const e = expRes.data as unknown as ExpenseRow;

      setAmount(String(e.amount ?? ""));
      setDescription(e.description ?? "");
      setExpenseDate(e.expense_date ?? "");
      setCategoryId(e.category_id ?? "");
      setAccountId(e.account_id ?? "");

      setLoading(false);
    };

    load();
  }, [id, supabase]);

  const onSave = async (evt: React.FormEvent) => {
    evt.preventDefault();
    setOk(null);
    setError(null);

    const amt = Number(amount);
    if (!amount || Number.isNaN(amt) || amt <= 0) {
      setError("Please enter a valid amount (> 0).");
      return;
    }
    if (!accountId) {
      setError("Please select an account.");
      return;
    }
    if (!expenseDate) {
      setError("Please select a date.");
      return;
    }
    if (!id) {
      setError("Missing expense id.");
      return;
    }

    setSaving(true);

    const res = await supabaseUpd
      .from("expenses")
      .update({
        amount: amt,
        description: description || null,
        expense_date: expenseDate,
        category_id: categoryId || null,
        account_id: accountId,
      })
      .eq("id", id);

    if (res.error) {
      setError(`Could not update expense: ${res.error.message}`);
      setSaving(false);
      return;
    }

    setOk("Updated ✅");
    setSaving(false);
  };

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Edit Expense</h1>

        <a
          href="/expenses"
          style={{
            marginLeft: "auto",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Back
        </a>
      </div>

      {loading ? (
        <p style={{ marginTop: 14 }}>Loading…</p>
      ) : (
        <>
          {error && (
            <div
              style={{
                marginTop: 14,
                background: "#ffe6e6",
                padding: 12,
                borderRadius: 10,
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          {ok && (
            <div
              style={{
                marginTop: 14,
                background: "#e8ffe8",
                padding: 12,
                borderRadius: 10,
                marginBottom: 12,
              }}
            >
              {ok}
            </div>
          )}

          <form onSubmit={onSave} style={{ display: "grid", gap: 12, marginTop: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Amount</span>
              <input
                inputMode="decimal"
                placeholder="e.g., 250"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Description</span>
              <input
                placeholder="e.g., Lunch at office"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Category</span>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
              >
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Date</span>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Payment Account</span>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              disabled={saving}
              style={{
                padding: 12,
                borderRadius: 12,
                border: "none",
                fontWeight: 700,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </form>
        </>
      )}
    </main>
  );
}
