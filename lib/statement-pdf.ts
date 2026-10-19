import { rowsFromText, type StatementRow } from "@/lib/statement";

export type StatementParseResult = {
  source: "ai" | "text";
  rows: StatementRow[];
  /** Last 4 digits of the card or account the statement is for, when printed. */
  accountLast4: string | null;
};

/** Without receipt AI: pull the PDF's text and read lines that look like transactions. */
export async function readStatementText(pdf: Buffer): Promise<StatementParseResult | { error: string; status: number }> {
  const { extractTextItems, getDocumentProxy } = await import("unpdf");
  let pages;
  try {
    const doc = await getDocumentProxy(new Uint8Array(pdf));
    pages = (await extractTextItems(doc)).items;
  } catch {
    return { error: "That PDF couldn't be opened. If it's password-protected, save an unlocked copy first.", status: 422 };
  }
  // Rebuild lines from positioned text: same baseline → same line, left to right.
  const lines: string[] = [];
  for (const items of pages) {
    const rows: { y: number; parts: { x: number; str: string }[] }[] = [];
    for (const it of items) {
      if (!it.str.trim()) continue;
      const row = rows.find((r) => Math.abs(r.y - it.y) <= Math.max(2, it.height * 0.4));
      if (row) row.parts.push({ x: it.x, str: it.str });
      else rows.push({ y: it.y, parts: [{ x: it.x, str: it.str }] });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) lines.push(r.parts.sort((a, b) => a.x - b.x).map((p) => p.str.trim()).join(" "));
  }
  const text = lines.join("\n");
  if (!/\d/.test(text)) {
    return { error: "This PDF looks like a scan with no text in it. Upload a CSV or Excel export from your bank instead.", status: 422 };
  }
  const last4 = text.match(/(?:account|card)(?: number| ending(?: in)?| no\.?)?[:\s#]*(?:[x*•.\s-]*\d{0,4}[x*•.\s-]+)?(\d{4})\b/i)?.[1] ?? null;
  return { source: "text", rows: rowsFromText(text), accountLast4: last4 };
}
