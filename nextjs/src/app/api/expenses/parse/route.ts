// src/app/api/expenses/parse/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

type CategoryLite = { id: string; name: string };
type AccountLite = { id: string; name: string; type: string };

type DraftExpense = {
  amount: number | null;
  expense_date: string | null; // YYYY-MM-DD
  description: string | null;
  category_id: string | null;
  account_id: string | null;

  // guardrails / UX
  confidence: "high" | "medium" | "low";
  warnings: string[];
};

function isISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function clampAmount(n: number) {
  // Safety clamp; tweak as you like
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  if (n > 5_00_000) return null; // ₹5L cap to prevent wild hallucinations
  return Math.round(n);
}

function normalizeDraft(x: any): DraftExpense {
  const warnings: string[] = [];

  const amountRaw = typeof x?.amount === "number" ? x.amount : null;
  const amount = amountRaw === null ? null : clampAmount(amountRaw);
  if (amountRaw !== null && amount === null) warnings.push("Amount looked invalid/out of range; please verify.");

  const dateRaw = typeof x?.expense_date === "string" ? x.expense_date : null;
  const expense_date = dateRaw && isISODate(dateRaw) ? dateRaw : null;
  if (dateRaw && !expense_date) warnings.push("Date wasn’t in YYYY-MM-DD format; please verify.");

  const description = typeof x?.description === "string" ? x.description.trim() || null : null;

  const category_id = typeof x?.category_id === "string" ? x.category_id : null;
  const account_id = typeof x?.account_id === "string" ? x.account_id : null;

  const confidence: DraftExpense["confidence"] =
    x?.confidence === "high" || x?.confidence === "medium" || x?.confidence === "low" ? x.confidence : "low";

  const w = Array.isArray(x?.warnings) ? x.warnings.filter((s: any) => typeof s === "string") : [];
  return {
    amount,
    expense_date,
    description,
    category_id,
    account_id,
    confidence,
    warnings: [...w, ...warnings],
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const imageDataUrl = String(body?.imageDataUrl || "");
    const categories = (body?.categories || []) as CategoryLite[];
    const accounts = (body?.accounts || []) as AccountLite[];

    if (!imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "Invalid imageDataUrl (expected data:image/...)" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `
You are extracting an expense from a receipt/screenshot for a personal finance app.

Return ONLY valid JSON (no markdown, no commentary) matching this schema:
{
  "amount": number|null,
  "expense_date": "YYYY-MM-DD"|null,
  "description": string|null,
  "category_id": string|null,
  "account_id": string|null,
  "confidence": "high"|"medium"|"low",
  "warnings": string[]
}

Rules:
- amount: prefer TOTAL PAID / GRAND TOTAL. If multiple totals exist, pick the final payable. If unclear, null + warning.
- expense_date: must be YYYY-MM-DD. If only partial date, null + warning.
- description: short merchant + context (e.g. "Starbucks - coffee", "Amazon - household items").
- category_id: choose best match from the provided categories list; otherwise null. Do NOT invent ids.
- account_id: choose best match ONLY if the image explicitly indicates the account/card/wallet; else null.
- confidence: high only if amount+date are clear.
- Always include warnings if anything is uncertain.
`.trim();

    const catList = categories.map((c) => ({ id: c.id, name: c.name }));
    const accList = accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }));

    const userText = `
Extract the expense from this image.

Allowed categories (pick category_id from this list only):
${JSON.stringify(catList)}

Allowed accounts (pick account_id from this list only; otherwise null):
${JSON.stringify(accList)}
`.trim();

    // The official quickstart shows image input via `input_image`.  [oai_citation:1‡OpenAI Platform](https://platform.openai.com/docs/quickstart)
    const resp = await client.responses.create({
      model: "gpt-5",
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: system }],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: userText },
            { type: "input_image", image_url: imageDataUrl },
          ],
        },
      ],
    });

    const raw = resp.output_text || "";
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Model did not return valid JSON", raw },
        { status: 502 }
      );
    }

    const draft = normalizeDraft(parsed);
    return NextResponse.json({ draft }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
