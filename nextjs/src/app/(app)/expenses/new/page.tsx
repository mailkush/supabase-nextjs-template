"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSPAClient } from "@/lib/supabase/client";

type CategoryLite = { id: string; name: string };
type AccountLite = { id: string; name: string; type: string };

type DraftExpense = {
  amount: number | null;
  expense_date: string | null;
  description: string | null;
  category_id: string | null;
  account_id: string | null;
  confidence: "high" | "medium" | "low";
  warnings: string[];
};

type QueryResult = { data: unknown[] | null; error: { message: string } | null };

type SimpleQuery = {
  order: (column: string, opts: { ascending: boolean }) => Promise<QueryResult>;
};

type InsertQuery = {
  insert: (values: Record<string, unknown>) => {
    select: (cols: string) => {
      single: () => Promise<{ data: unknown | null; error: { message: string } | null }>;
    };
  };
};

type LooseSupabase = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string | null } | null } | null;
      error: { message: string } | null;
    }>;
  };
  from: (table: string) => {
    select: (columns: string) => SimpleQuery;
  } & InsertQuery;
};

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

function ScanReceiptDraft(props: {
  categories: CategoryLite[];
  accounts: AccountLite[];
  onApply: (draft: DraftExpense) => void; // parent fills form state from this
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftExpense | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const catName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of props.categories) m[c.id] = c.name;
    return m;
  }, [props.categories]);

  const accName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of props.accounts) m[a.id] = `${a.name} (${a.type})`;
    return m;
  }, [props.accounts]);

  const badgeStyle = useMemo((): React.CSSProperties | null => {
    if (!draft) return null;
    const map: Record<DraftExpense["confidence"], React.CSSProperties> = {
      high: { background: "#e8ffe8", border: "1px solid #b7f5b7" },
      medium: { background: "#fff7e6", border: "1px solid #ffd28a" },
      low: { background: "#ffe6e6", border: "1px solid #ffb3b3" },
    };
    return map[draft.confidence];
  }, [draft]);

  const onPick = async (file: File | null) => {
    if (!file) return;

    setBusy(true);
    setErr(null);
    setDraft(null);

    try {
      const imageDataUrl = await fileToDataUrl(file);

      const res = await fetch("/api/expenses/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl,
          categories: props.categories,
          accounts: props.accounts,
        }),
      });

      const json: unknown = await res.json();

      if (!res.ok) {
        const msg =
          typeof json === "object" && json !== null && "error" in json
            ? String((json as { error?: unknown }).error ?? "Failed to parse receipt")
            : "Failed to parse receipt";
        throw new Error(msg);
      }

      const draftObj =
        typeof json === "object" && json !== null && "draft" in json
          ? (json as { draft: DraftExpense }).draft
          : null;

      if (!draftObj) throw new Error("Parser returned no draft");
      setDraft(draftObj);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div style={{ border: "1px solid #e7e7e7", borderRadius: 16, padding: 12, background: "white" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 900 }}>Scan receipt</div>

        <label
          style={{
            marginLeft: "auto",
            padding: "8px 10px",
            borderRadius: 12,
            border: "1px solid #ddd",
            cursor: busy ? "not-allowed" : "pointer",
            fontWeight: 800,
            background: "white",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Scanning…" : "Upload image"}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            // ✅ IMPORTANT: removed capture="environment" so iPhone allows Camera Roll + Camera
            style={{ display: "none" }}
            disabled={busy}
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
        Guardrail: this creates a <b>draft</b>. Nothing is saved until you confirm.
      </div>

      {err ? (
        <div style={{ marginTop: 10, background: "#ffe6e6", padding: 10, borderRadius: 12 }}>{err}</div>
      ) : null}

      {draft ? (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ ...(badgeStyle ?? {}), padding: "6px 10px", borderRadius: 999, fontWeight: 900 }}>
              Confidence: {draft.confidence.toUpperCase()}
            </div>

            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {draft.warnings?.length ? `${draft.warnings.length} warning(s)` : "No warnings"}
            </div>
          </div>

          {draft.warnings?.length ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, opacity: 0.85 }}>
              {draft.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}

          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
            <div style={{ fontSize: 13, opacity: 0.8 }}>Draft</div>

            <div style={{ marginTop: 6, display: "grid", gap: 4, fontSize: 14 }}>
              <div>
                <b>Amount:</b> {draft.amount ?? "—"}
              </div>
              <div>
                <b>Date:</b> {draft.expense_date ?? "—"}
              </div>
              <div>
                <b>Description:</b> {draft.description ?? "—"}
              </div>
              <div>
                <b>Category:</b> {draft.category_id ? catName[draft.category_id] ?? "(unknown)" : "—"}
              </div>
              <div>
                <b>Account:</b> {draft.account_id ? accName[draft.account_id] ?? "(unknown)" : "—"}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => props.onApply(draft)}
            style={{
              padding: 12,
              borderRadius: 12,
              border: "none",
              fontWeight: 950,
              cursor: "pointer",
              background: "#111",
              color: "white",
            }}
          >
            Apply to form
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function NewExpensePage() {
  const router = useRouter();

  const [supabaseRaw] = useState(() => createSPAClient());
  const supabase = supabaseRaw as unknown as LooseSupabase;

  const [userId, setUserId] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);

  const [amount, setAmount] = useState<string>("");
  const [expenseDate, setExpenseDate] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");

  const [loadingLists, setLoadingLists] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadLists = async () => {
      setLoadingLists(true);
      setError(null);

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user) {
        router.replace("/auth/login");
        return;
      }
      setUserId(authData.user.id);

      const catQ = supabase.from("categories").select("id,name") as SimpleQuery;
      const catRes = await catQ.order("name", { ascending: true });
      if (catRes.error) {
        setError(`Could not load categories: ${catRes.error.message}`);
        setLoadingLists(false);
        return;
      }
      setCategories((catRes.data ?? []) as unknown as CategoryLite[]);

      const accQ = supabase.from("accounts").select("id,name,type") as SimpleQuery;
      const accRes = await accQ.order("name", { ascending: true });
      if (accRes.error) {
        setError(`Could not load accounts: ${accRes.error.message}`);
        setLoadingLists(false);
        return;
      }
      setAccounts((accRes.data ?? []) as unknown as AccountLite[]);

      // sensible defaults
      if (!expenseDate) {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        setExpenseDate(`${yyyy}-${mm}-${dd}`);
      }

      setLoadingLists(false);
    };

    loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, supabase]);

  const onApplyDraft = (draft: DraftExpense) => {
    if (draft.amount !== null && Number.isFinite(draft.amount)) setAmount(String(draft.amount));
    if (draft.expense_date) setExpenseDate(draft.expense_date);
    if (draft.description) setDescription(draft.description);
    if (draft.category_id) setCategoryId(draft.category_id);
    if (draft.account_id) setAccountId(draft.account_id);
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!userId) {
      setError("Not logged in. Please sign in again.");
      return;
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!expenseDate) {
      setError("Select a date.");
      return;
    }
    if (!accountId) {
      setError("Select an account.");
      return;
    }

    setSaving(true);

    try {
      const payload: Record<string, unknown> = {
        user_id: userId, // ✅ REQUIRED because your table enforces it (FK -> profiles.id)
        amount: amt,
        expense_date: expenseDate,
        description: description.trim() ? description.trim() : null,
        category_id: categoryId ? categoryId : null,
        account_id: accountId,
      };

      const res = await supabase.from("expenses").insert(payload).select("id").single();
      if (res.error) throw new Error(res.error.message);

      router.push("/expenses");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save expense");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ display: "grid", gap: 12 }}>
      {error ? (
        <div style={{ background: "#ffe6e6", padding: 12, borderRadius: 12, border: "1px solid #ffcccc" }}>
          {error}
        </div>
      ) : null}

      {loadingLists ? (
        <div style={{ opacity: 0.75 }}>Loading…</div>
      ) : (
        <>
          <ScanReceiptDraft categories={categories} accounts={accounts} onApply={onApplyDraft} />

          <form
            onSubmit={onSave}
            style={{ border: "1px solid #e7e7e7", borderRadius: 16, padding: 12, background: "white" }}
          >
            <div style={{ fontWeight: 900, marginBottom: 10 }}>New expense</div>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Amount</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="e.g. 450"
                  style={{ padding: 10, borderRadius: 12, border: "1px solid #ccc" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Date</span>
                <input
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  type="date"
                  style={{ padding: 10, borderRadius: 12, border: "1px solid #ccc" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Description</span>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Lunch"
                  style={{ padding: 10, borderRadius: 12, border: "1px solid #ccc" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Category</span>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  style={{ padding: 10, borderRadius: 12, border: "1px solid #ccc", background: "white" }}
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
                <span style={{ fontSize: 12, opacity: 0.75 }}>Account</span>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  style={{ padding: 10, borderRadius: 12, border: "1px solid #ccc", background: "white" }}
                >
                  <option value="">Select…</option>
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
                  fontWeight: 950,
                  cursor: saving ? "not-allowed" : "pointer",
                  background: "#111",
                  color: "white",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Saving…" : "Save expense"}
              </button>
            </div>
          </form>
        </>
      )}
    </main>
  );
}
