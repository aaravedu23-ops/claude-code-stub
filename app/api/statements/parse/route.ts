import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { parseStatementDate, type StatementRow } from "@/lib/statement";
import { readStatementText, type StatementParseResult } from "@/lib/statement-pdf";

// Long statements take a while for the model to read through.
export const maxDuration = 300;

/** Vercel rejects request bodies over 4.5MB. */
const MAX_BYTES = 4 * 1024 * 1024;

const extraction = z.object({
  account_last4: z.string(),
  transactions: z.array(
    z.object({
      date: z.string(),
      description: z.string(),
      amount: z.number(),
      direction: z.enum(["out", "in"]),
      category: z.string(),
    }),
  ),
});

function schemaFor(categoryNames: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["account_last4", "transactions"],
    properties: {
      account_last4: {
        type: "string",
        description: "Last 4 digits of the card or account number this statement is for, or empty string",
      },
      transactions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["date", "description", "amount", "direction", "category"],
          properties: {
            date: { type: "string", description: "Transaction date as YYYY-MM-DD (not the posting date when both are shown)" },
            description: { type: "string", description: "The description exactly as printed on the statement" },
            amount: { type: "number", description: "Amount in dollars, always positive" },
            direction: {
              type: "string",
              enum: ["out", "in"],
              description:
                "out: money leaving the account (purchases, fees, withdrawals, checks). in: money coming back (refunds, returns, credits, payments to the card, deposits)",
            },
            category: {
              type: "string",
              enum: [...categoryNames, ""],
              description: "Best matching category for purchases and returns, or empty string",
            },
          },
        },
      },
    },
  };
}

async function readWithClaude(pdf: Buffer, categoryNames: string[]): Promise<StatementParseResult | { error: string; status: number }> {
  const client = new Anthropic();
  let message;
  try {
    // Streaming: a long statement can produce a lot of output.
    const stream = client.beta.messages.stream({
      model: process.env.STATEMENT_MODEL || process.env.RECEIPT_MODEL || "claude-opus-5-5",
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: schemaFor(categoryNames) },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
            {
              type: "text",
              text: `This is a bank or credit card statement. List every individual transaction from its activity sections, in order, for an expense tracker. Leave out balances, subtotals, totals, interest and fee summaries, and anything that isn't a single transaction. Use the statement period to fill in years that aren't printed. Today is ${new Date().toISOString().slice(0, 10)}.`,
            },
          ],
        },
      ],
    });
    message = await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { error: "Statement reading is busy. Try again in a minute.", status: 429 };
    if (e instanceof Anthropic.BadRequestError) {
      console.error("Statement read rejected", e.message);
      return { error: "That PDF couldn't be read. If it's password-protected, save an unlocked copy first.", status: 422 };
    }
    if (e instanceof Anthropic.APIError) {
      console.error("Statement read failed", e.status, e.message);
      return { error: "The statement couldn't be read right now. Try again, or upload a CSV export instead.", status: 502 };
    }
    throw e;
  }

  if (message.stop_reason === "refusal") return { error: "The statement couldn't be read. Try a CSV export instead.", status: 422 };
  if (message.stop_reason === "max_tokens") {
    return { error: "That statement is too long to read in one go. Upload a shorter date range.", status: 422 };
  }
  const text = message.content.find((b) => b.type === "text");
  let json: unknown = null;
  try {
    json = text && text.type === "text" ? JSON.parse(text.text) : null;
  } catch {
    json = null;
  }
  const parsed = extraction.safeParse(json);
  if (!parsed.success) return { error: "The statement couldn't be read. Try a CSV export instead.", status: 422 };

  const rows: StatementRow[] = [];
  for (const t of parsed.data.transactions) {
    const date = parseStatementDate(t.date);
    const amount = Math.round(Math.abs(t.amount) * 100);
    const description = t.description.replace(/\s+/g, " ").trim().slice(0, 200);
    if (!date || !amount || !description) continue;
    rows.push({ date, description, amount, direction: t.direction, category: t.category || null });
  }
  const last4 = parsed.data.account_last4.match(/(\d{4})\D*$/)?.[1] ?? null;
  return { source: "ai", rows, accountLast4: last4 };
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in to import statements." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose a PDF statement to upload." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "That PDF is over 4MB. Upload a shorter date range or a CSV export." }, { status: 413 });
  }
  const pdf = Buffer.from(await file.arrayBuffer());
  if (pdf.subarray(0, 5).toString() !== "%PDF-") return Response.json({ error: "That file isn't a PDF." }, { status: 400 });

  const useAi = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  let result: StatementParseResult | { error: string; status: number };
  if (useAi) {
    const categories = await prisma.category.findMany({
      where: { userId: session.user.id, archived: false },
      select: { name: true },
    });
    result = await readWithClaude(pdf, categories.map((c) => c.name));
  } else {
    result = await readStatementText(pdf);
  }

  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  if (result.rows.length === 0) {
    return Response.json(
      { error: "No transactions were found in that PDF. Try the CSV or Excel export from your bank's website." },
      { status: 422 },
    );
  }
  return Response.json(result);
}
