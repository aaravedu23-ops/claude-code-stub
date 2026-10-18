import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import type { ScanResult } from "@/lib/receipt-types";

export const maxDuration = 60;

const bodySchema = z.object({
  image: z.string().regex(/^data:image\/(jpeg|png|webp|gif);base64,/).max(8_000_000),
});

const extraction = z.object({
  kind: z.enum(["purchase", "refund"]),
  merchant: z.string(),
  date: z.string(),
  total: z.number(),
  card_last4: z.string(),
  card_network: z.string(),
  category: z.string(),
  items: z.array(z.object({ name: z.string(), amount: z.number() })),
});

function schemaFor(categoryNames: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["kind", "merchant", "date", "total", "card_last4", "card_network", "category", "items"],
    properties: {
      kind: {
        type: "string",
        enum: ["purchase", "refund"],
        description: "refund when the receipt is a return, refund or exchange credit",
      },
      merchant: { type: "string", description: "Store name as a person would say it, e.g. 'Trader Joe's'" },
      date: { type: "string", description: "Transaction date as YYYY-MM-DD, or empty string if not printed" },
      total: { type: "number", description: "Final amount paid or refunded in dollars, always positive" },
      card_last4: { type: "string", description: "Last 4 digits of the payment card if printed, else empty string" },
      card_network: { type: "string", description: "Visa, Mastercard, Amex, Discover, Debit, Cash, or empty string" },
      category: {
        type: "string",
        enum: [...categoryNames, ""],
        description: "Best matching category from the user's list, or empty string",
      },
      items: {
        type: "array",
        description: "Line items with their prices in dollars. Leave out tax, subtotal and total lines.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "amount"],
          properties: { name: { type: "string" }, amount: { type: "number" } },
        },
      },
    },
  };
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in to scan receipts." }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    // The client falls back to on-device OCR.
    return Response.json({ error: "Receipt AI isn't set up.", fallback: "ocr" }, { status: 501 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Upload a JPEG or PNG photo of the receipt." }, { status: 400 });

  const [, mediaType, data] = body.data.image.match(/^data:(image\/[a-z]+);base64,(.+)$/)!;
  const userId = session.user.id;
  const [categories, cards] = await Promise.all([
    prisma.category.findMany({ where: { userId, archived: false }, select: { id: true, name: true } }),
    prisma.paymentCard.findMany({ where: { userId, archived: false }, select: { id: true, last4: true, network: true } }),
  ]);

  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.create({
      model: process.env.RECEIPT_MODEL || "claude-opus-5-5",
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: schemaFor(categories.map((c) => c.name)) },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType as "image/jpeg", data },
            },
            {
              type: "text",
              text: `Read this receipt photo and pull out the details for an expense tracker. Today is ${new Date().toISOString().slice(0, 10)}; if the year is missing or ambiguous, assume the most recent date that isn't in the future. If something isn't printed or can't be read, leave it empty rather than guessing.`,
            },
          ],
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Receipt reading is busy. Try again in a minute." }, { status: 429 });
    }
    if (e instanceof Anthropic.APIError) {
      console.error("Receipt scan failed", e.status, e.message);
      return Response.json({ error: "The receipt couldn't be read. Fill in the details by hand." }, { status: 502 });
    }
    throw e;
  }

  if (response.stop_reason === "refusal") {
    return Response.json({ error: "The receipt couldn't be read. Fill in the details by hand." }, { status: 422 });
  }
  const text = response.content.find((b) => b.type === "text");
  let json: unknown = null;
  try {
    json = text && text.type === "text" ? JSON.parse(text.text) : null;
  } catch {
    json = null;
  }
  const parsed = extraction.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "The receipt couldn't be read. Fill in the details by hand." }, { status: 422 });
  }

  const x = parsed.data;
  const card =
    (x.card_last4 && cards.find((c) => c.last4 === x.card_last4)) ||
    (x.card_network && cards.filter((c) => c.network.toLowerCase() === x.card_network.toLowerCase()).length === 1
      ? cards.find((c) => c.network.toLowerCase() === x.card_network.toLowerCase())
      : undefined);

  const result: ScanResult = {
    source: "ai",
    kind: x.kind,
    merchant: x.merchant.trim(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : null,
    amount: x.total > 0 ? Math.abs(x.total).toFixed(2) : null,
    cardId: card ? card.id : null,
    cardLast4: x.card_last4 || null,
    categoryId: categories.find((c) => c.name === x.category)?.id ?? null,
    items: x.items
      .filter((i) => i.name.trim())
      .map((i) => ({ name: i.name.trim().slice(0, 120), amount: Math.round(i.amount * 100) })),
  };
  return Response.json(result);
}
