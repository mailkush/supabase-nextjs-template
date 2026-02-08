"use client";

import React, { useMemo, useState } from "react";

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

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

export function ScanReceiptDraft(props: {
  categories: CategoryLite[];
  accounts: AccountLite[];
  onApply: (draft: DraftExpense) => void; // you fill your form state from this
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftExpense | null>(null);

  const badge = useMemo(() => {
    if (!draft) return null;
    const map: Record<string, React.CSSProperties> = {
      high: { background: "#e8ffe8", border: "1px solid #b7f5b7" },
      medium: { background: "#fff7e6", border: "1px solid #ffd28a" },
      low: { background: "#ffe6e6", border: "1px solid #ffb3b3" },
    };
    return map[draft.confidence] || map.low;
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

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to parse receipt");
      setDraft(json.draft as DraftExpense);
    } catch (e: any) {
      setErr(e?.message || "Something went wrong");
    } finally {
      setBusy(false);
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
          }}
        >
          {busy ? "Scanning…" : "Upload image"}
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            disabled={busy}
            onChange={(e) => onPick(e.target.files?.[0] || null)}
          />
        </label>
      </div>

      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
        Guardrail: this will create a <b>draft</b>. Nothing is saved until you confirm.
      </div>

      {err ? (
        <div style={{ marginTop: 10, background: "#ffe6e6", padding: 10, borderRadius: 12 }}>{err}</div>
      ) : null}

      {draft ? (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ ...badge, padding: "6px 10px", borderRadius: 999, fontWeight: 900 }}>
              Confidence: {draft.confidence.toUpperCase()}
            </div>
            {draft.warnings?.length ? (
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                {draft.warnings.length} warning(s)
              </div>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.75 }}>No warnings</div>
            )}
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
              <div><b>Amount:</b> {draft.amount ?? "—"}</div>
              <div><b>Date:</b> {draft.expense_date ?? "—"}</div>
              <div><b>Description:</b> {draft.description ?? "—"}</div>
              <div><b>Category ID:</b> {draft.category_id ?? "—"}</div>
              <div><b>Account ID:</b> {draft.account_id ?? "—"}</div>
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
            }}
          >
            Apply to form
          </button>
        </div>
      ) : null}
    </div>
  );
}
