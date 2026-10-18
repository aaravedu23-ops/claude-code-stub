export type ScanResult = {
  source: "ai" | "ocr";
  kind: "purchase" | "refund";
  merchant: string;
  /** YYYY-MM-DD */
  date: string | null;
  /** Dollars as a string, e.g. "42.10" */
  amount: string | null;
  cardId: string | null;
  cardLast4: string | null;
  categoryId: string | null;
  items: { name: string; amount: number }[];
};
