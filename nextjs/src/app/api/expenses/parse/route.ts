import { NextResponse } from "next/server";

type CategoryLite = { id: string; name: string };
type AccountLite = { id: string; name: string; type: string };

type DraftExpense = {
  amount: number | null;
  expense_date: string | null; // YYYY-MM-DD
  description: string | null;
  category_id: string | null;
  account_id: string | null;
  confidence: "high" | "medium" | "low";
  warnings: string[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Responses API can return text in different shapes.
 * Prefer:
 * - data.output_text (if present)
 * Else:
 * - walk data.output[].content[] and concatenate content items of type "output_text" or "summary_text"
 */
function extractResponseText(data: unknown): string | null {
  if (!isRecord(data)) return null;

  // 1) easiest path
  const direct = (data as { output_text?: unknown }).output_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  // 2) walk output blocks
  const out = (data as { output?: unknown }).output;
  if (!Array.isArray(out)) return null;

  const parts: string[] = [];

  for (const item of out) {
    if (!isRecord(item)) continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const c of content) {
      if (!isRecord(c)) continue;

      const type = (c as { type?: unknown }).type;
      const text = (c as { text?: unknown }).text;

      if ((type === "output_text" || type === "summary_text") && typeof text === "string" && text.trim()) {
        parts.push(text.trim());
      }
    }
  }

  const joined = parts.join("\n").trim();
  return joined ? joined : null;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return jsonError("Missing OPENAI_API_KEY on server", 500);

    const body: unknown = await req.json();
    if (!isRecord(body)) return jsonError("Invalid JSON body");

    const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : null;
    const categories = Array.isArray(body.categories) ? (body.categories as CategoryLite[]) : [];
    const accounts = Array.isArray(body.accounts) ? (body.accounts as AccountLite[]) : [];

    if (!imageDataUrl) return jsonError("imageDataUrl is required");
    if (!imageDataUrl.startsWith("data:image/")) return jsonError("imageDataUrl must be a data:image/* URL");

    const system = `
You are extracting a single expense from a receipt image.
Return STRICT JSON only. No markdown. No explanations.

Rules:
- amount: number (INR) OR null if unsure
- expense_date: YYYY-MM-DD OR null if unsure
- description: short merchant + items summary (max ~80 chars) OR null
- category_id: must be one of the provided categories' ids OR null
- account_id: must be one of the provided accounts' ids OR null
- confidence: "high" | "medium" | "low"
- warnings: array of strings with any issues/assumptions (empty if none)

Be conservative. If unsure, use null + add warnings + lower confidence.
`.trim();

    const user = {
      categories,
      accounts,
      task: "Extract best-guess draft expense from this receipt image.",
    };

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          {
            role: "user",
            content: [
              { type: "input_text", text: JSON.stringify(user) },
              { type: "input_image", image_url: imageDataUrl },
            ],
          },
        ],
        // ask for strict JSON
        text: { format: { type: "json_object" } },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return jsonError(`OpenAI error: ${errText}`, 500);
    }

    const data: unknown = await resp.json();

    const outputText = extractResponseText(data);
    if (!outputText) {
      // helpful debug (safe): return the keys we got
      const keys = isRecord(data) ? Object.keys(data).join(", ") : "not-an-object";
      return jsonError(`OpenAI returned no readable text. Response keys: ${keys}`, 500);
    }

    // Parse the JSON string
    let parsed: unknown;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      return jsonError(`Model did not return valid JSON. Got: ${outputText.slice(0, 300)}`, 500);
    }

    if (!isRecord(parsed)) return jsonError("Draft JSON is invalid", 500);

    const draft: DraftExpense = {
      amount: typeof parsed.amount === "number" ? parsed.amount : null,
      expense_date: typeof parsed.expense_date === "string" ? parsed.expense_date : null,
      description: typeof parsed.description === "string" ? parsed.description : null,
      category_id: typeof parsed.category_id === "string" ? parsed.category_id : null,
      account_id: typeof parsed.account_id === "string" ? parsed.account_id : null,
      confidence:
        parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
          ? parsed.confidence
          : "low",
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map((x) => String(x)) : [],
    };

    // Guardrail: ensure IDs are from allowed list
    const validCatIds = new Set(categories.map((c) => c.id));
    const validAccIds = new Set(accounts.map((a) => a.id));

    if (draft.category_id && !validCatIds.has(draft.category_id)) {
      draft.warnings.push("Model suggested a category_id not in allowed list; set to null.");
      draft.category_id = null;
      draft.confidence = "low";
    }

    if (draft.account_id && !validAccIds.has(draft.account_id)) {
      draft.warnings.push("Model suggested an account_id not in allowed list; set to null.");
      draft.account_id = null;
      draft.confidence = "low";
    }

    return NextResponse.json({ draft });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
