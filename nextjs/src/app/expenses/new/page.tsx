"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Category = { id: string; name: string };
type Account = { id: string; name: string; type: string };

function todayISODate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function NewExpensePage() {
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
  const [expenseDate, setExpenseDate] = useState<string>(todayISODate());

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      // Check logged-in user (cookie session)
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user) {
        setError("You are not logged in. Please sign in first.");
        setLoading(false);
        return;
      }

      // Load categories (shared)
      const { data: catData, error: catErr } = await supabase
        .from("categories")
        .select("id,name")
        .order("name", { ascending: true });

      if (catErr) {
        setError(`Could not load categories: ${catErr.message}`);
        setLoading(false);
        return;
      }

      // Load accounts (RLS: only your accounts)
      const { data: accData, error: accErr } = await supabase
        .from("accounts")
        .select("id,name,type")
        .order("name", { ascending: true });

      if (accErr) {
        setError(`Could not load accounts: ${accErr.message}`);
        setLoading(false);
        return;
      }

      setCategories((catData || []) as Category[]);
      setAccounts((accData || []) as Account[]);

      if (catData?.length) setCategoryId(catData[0].id);
      if (accData?.length) setAccountId(accData[0].id);

      setLoading(false);
    };

    load();
  }, []);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
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

    setSaving(true);

    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) {
      setError("You are not logged in. Please sign in again.");
      setSaving(false);
      return;
    }

    const { error: insErr } = await supabase.from("expenses").insert({
      user_id: user.id,
      account_id: accountId,
      category_id: categoryId || null,
      amount: amt,
      description: description || null,
      expense_date: expenseDate,
    });

    if (insErr) {
      setError(`Could not save expense: ${insErr.message}`);
      setSaving(false);
      return;
    }

    setOk("Saved ✅");
    setAmount("");
    setDescription("");
    setExpenseDate(todayISODate());
    setSaving(false);
  };

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
        Add Expense
      </h1>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          {error && (
            <div
              style={{
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
                background: "#e8ffe8",
                padding: 12,
                borderRadius: 10,
                marginBottom: 12,
              }}
            >
              {ok}
            </div>
          )}

          <form onSubmit={onSave} style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Amount</span>
              <input
                inputMode="decimal"
                placeholder="e.g., 250"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Description</span>
              <input
                placeholder="e.g., Lunch at office"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Category</span>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
              >
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
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Payment Account</span>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                }}
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
              {saving ? "Saving…" : "Save Expense"}
            </button>
          </form>
        </>
      )}
    </main>
  );
}
