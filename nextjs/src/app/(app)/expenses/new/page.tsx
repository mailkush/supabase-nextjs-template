"use client";

import React, { useMemo, useRef, useState } from "react";

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
      // ✅ allow uploading the same file again
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
            capture="environment"
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
                <b>Category:</b>{" "}
                {draft.category_id ? catName[draft.category_id] ?? "(unknown category)" : "—"}
              </div>
              <div>
                <b>Account:</b>{" "}
                {draft.account_id ? accName[draft.account_id] ?? "(unknown account)" : "—"}
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
