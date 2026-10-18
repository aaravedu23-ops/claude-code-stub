import type { ScanResult } from "@/lib/receipt-types";
import type { CardOption, CategoryOption } from "@/lib/types";

/**
 * On-device fallback for when receipt AI isn't configured. Tesseract reads the
 * text; simple rules pick out the store, date, total and card. It's rougher
 * than the AI path, which is why every field stays editable.
 */
export async function scanWithOcr(
  dataUrl: string,
  cards: CardOption[],
  categories: CategoryOption[],
): Promise<ScanResult> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(dataUrl);
    return parseReceiptText(data.text, cards, categories);
  } finally {
    await worker.terminate();
  }
}

const MONEY = /\$?\s?(\d{1,3}(?:[,\s]\d{3})*|\d+)[.,](\d{2})\b/;

export function parseReceiptText(text: string, cards: CardOption[], categories: CategoryOption[]): ScanResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const upper = text.toUpperCase();

  const kind: ScanResult["kind"] = /\b(RETURN|REFUND|CREDIT VOUCHER|MERCHANDISE CREDIT)\b/.test(upper) ? "refund" : "purchase";

  // Store: the first line that is mostly letters and isn't an address or phone number.
  const merchant =
    lines
      .slice(0, 6)
      .find((l) => /[A-Za-z]{3,}/.test(l) && !/\d{3}[-.\s]\d{3}[-.\s]\d{4}/.test(l) && !/^\d+\s/.test(l) && l.length <= 40)
      ?.replace(/[^A-Za-z0-9&'.\s-]/g, "")
      .replace(/\s+/g, " ")
      .trim() ?? "";

  // Total: prefer a line that says TOTAL (but not SUBTOTAL), else the largest amount.
  let amount: string | null = null;
  const totalLine = [...lines]
    .reverse()
    .find((l) => /\b(GRAND\s+)?TOTAL\b|\bAMOUNT\s+DUE\b|\bBALANCE\b|\bREFUND\b/i.test(l) && !/SUB\s*-?\s*TOTAL/i.test(l) && MONEY.test(l));
  const toNum = (m: RegExpMatchArray) => Number(`${m[1].replace(/[,\s]/g, "")}.${m[2]}`);
  if (totalLine) {
    const m = totalLine.match(MONEY);
    if (m) amount = toNum(m).toFixed(2);
  }
  if (!amount) {
    const all = [...text.matchAll(new RegExp(MONEY, "g"))].map(toNum).filter((n) => n > 0 && n < 100000);
    if (all.length) amount = Math.max(...all).toFixed(2);
  }

  // Date: 10/16/2026, 10-16-26, 2026-10-16, Oct 16 2026.
  let date: string | null = null;
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  const us = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  const named = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (iso) date = `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`;
  else if (us) {
    const y = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
    if (+us[1] <= 12 && +us[2] <= 31) date = `${y}-${pad(+us[1])}-${pad(+us[2])}`;
  } else if (named) {
    const month = "janfebmaraprmayjunjulaugsepoctnovdec".indexOf(named[1].slice(0, 3).toLowerCase()) / 3 + 1;
    date = `${named[3]}-${pad(month)}-${pad(+named[2])}`;
  }
  if (date && new Date(date) > new Date()) date = null;

  const last4 = upper.match(/(?:\*{2,}|X{2,}|#)\s?(\d{4})\b/)?.[1] ?? null;
  const card = last4 ? cards.find((c) => c.last4 === last4) : undefined;

  // Category: only when the store name contains a category name. Otherwise the person picks.
  const category = categories.find((c) => merchant && merchant.toLowerCase().includes(c.name.toLowerCase()));

  return {
    source: "ocr",
    kind,
    merchant,
    date,
    amount,
    cardId: card?.id ?? null,
    cardLast4: last4,
    categoryId: category?.id ?? null,
    items: [],
  };
}
