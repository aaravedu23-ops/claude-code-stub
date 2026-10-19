/**
 * Cross-checks statement rows against what's already logged, so an import
 * never counts the same purchase or return twice, and links returns to the
 * purchase they came from. Pure: the server action loads the data and calls this.
 */
import {
  cleanMerchant,
  daysBetween,
  looksLikeTransfer,
  merchantKey,
  merchantsMatch,
  rowFingerprint,
  type StatementRow,
} from "@/lib/statement";

/** Days apart a receipt date and a statement's posting date can be and still be the same purchase. */
export const MATCH_WINDOW = { purchase: 5, refund: 7 } as const;
/** How far back a return can reach for its purchase. */
export const RETURN_WINDOW_DAYS = 180;

export type ExistingTxn = {
  id: string;
  kind: "purchase" | "refund";
  amount: number;
  merchant: string;
  /** YYYY-MM-DD */
  date: string;
  cardId: string | null;
  categoryId: string | null;
  importKey: string | null;
  source: string;
  /** For purchases: what's already been returned against it. */
  refunded: number;
};

export type MatchLevel = "imported" | "likely" | "possible";

export type PreparedRow = {
  /** Fingerprint stored on the transaction so the same row is never imported twice. */
  key: string;
  date: string;
  description: string;
  merchant: string;
  amount: number;
  direction: "out" | "in";
  /** What the import will do with this row. People can change it before importing. */
  kind: "purchase" | "refund" | "skip";
  categoryId: string | null;
  cardId: string | null;
  /** An entry already in the app that looks like this row. */
  match: { level: MatchLevel; id: string; merchant: string; date: string; amount: number; source: string } | null;
  /** True for card payments, transfers, paychecks and the like. */
  transfer: boolean;
  /** For money coming back: purchases this could be a return of. Values are "txn:<id>" or "row:<key>". */
  linkOptions: { value: string; label: string; remaining: number }[];
  link: string | null;
};

type Category = { id: string; name: string };
type Card = { id: string; last4: string };
type Memory = { merchant: string; categoryId: string | null };

/** Keyword hints for the default categories. Only used when the category exists. */
const CATEGORY_HINTS: [string, RegExp][] = [
  ["Groceries", /grocery|groceries|supermarket|market\b|whole foods|trader joe|safeway|kroger|aldi|costco|instacart|wegmans|publix|sprouts|h-e-b|\bheb\b|food lion|meijer|tesco|sainsbury/i],
  ["Dining", /restaurant|cafe|café|coffee|starbucks|pizza|grill|\bbar\b|kitchen|taco|burger|sushi|mcdonald|chipotle|doordash|uber eats|grubhub|bakery|diner|bistro|ramen|thai|noodle|deli\b|wings|chick-fil-a|subway|dunkin|panera/i],
  ["Transport", /\buber\b|\blyft\b|shell|chevron|exxon|\bgas\b|fuel|parking|transit|metro|\btoll|\bbp\b|mobil|sunoco|valero|citgo|arco|\bmta\b|clipper|amtrak/i],
  ["Shopping", /amazon|target|walmart|uniqlo|best buy|ikea|home depot|lowe's|etsy|ebay|apparel|clothing|nordstrom|macy|gap\b|old navy|zara|h&m|nike|adidas|sephora|ulta/i],
  ["Bills & utilities", /electric|utility|utilities|water bill|internet|comcast|xfinity|verizon|at&t|t-mobile|spectrum|insurance|geico|progressive|\brent\b|pg&e|con ed|duke energy/i],
  ["Health", /pharmacy|cvs|walgreens|rite aid|doctor|dental|dentist|clinic|hospital|medical|optometr|urgent care|labcorp|quest diag/i],
  ["Entertainment", /netflix|spotify|hulu|disney\+|cinema|theater|theatre|movie|\bamc\b|steam|playstation|xbox|nintendo|ticketmaster|stubhub|youtube|hbo|max\.com|audible/i],
  ["Travel", /airline|airlines|airways|hotel|airbnb|\bdelta\b|united air|southwest|jetblue|american air|marriott|hilton|hyatt|expedia|booking\.com|vrbo/i],
];

export function guessCategory(
  merchant: string,
  description: string,
  categories: Category[],
  memory: Memory[],
  hint?: string | null,
): string | null {
  const key = merchantKey(merchant);
  if (key) {
    const known = memory.find((m) => m.categoryId && sameKey(merchantKey(m.merchant), key));
    if (known?.categoryId && categories.some((c) => c.id === known.categoryId)) return known.categoryId;
  }
  const byName = (name: string) => categories.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ?? null;
  if (hint) {
    const id = byName(hint);
    if (id) return id;
  }
  const text = `${merchant} ${description}`;
  for (const [name, re] of CATEGORY_HINTS) {
    if (re.test(text)) {
      const id = byName(name);
      if (id) return id;
    }
  }
  return null;
}

/** Whether a remembered store name is this store: same key, or one key inside the other. */
function sameKey(a: string, b: string) {
  if (!a || !b) return false;
  return a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));
}

const shortDate = (iso: string) => new Date(`${iso}T12:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function prepareRows(input: {
  rows: StatementRow[];
  /** The card or account the whole statement belongs to, if picked. */
  cardId: string | null;
  cards: Card[];
  categories: Category[];
  /** Entries near the statement's dates (both kinds). */
  existing: ExistingTxn[];
  /** Purchases that returns on this statement could link to (may overlap `existing`). */
  purchases: ExistingTxn[];
  memory: Memory[];
}): PreparedRow[] {
  const { cards, categories, memory } = input;

  // 1. Clean up each row and give it a fingerprint.
  const seen = new Map<string, number>();
  const rows: PreparedRow[] = input.rows.map((r) => {
    const rowCard = (r.cardLast4 && cards.find((c) => c.last4 === r.cardLast4)?.id) || input.cardId;
    const base = rowFingerprint(r, rowCard, 0);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const cleaned = cleanMerchant(r.description);
    // Prefer how the person has written this store before.
    const key = merchantKey(cleaned);
    const known = key ? memory.find((m) => sameKey(merchantKey(m.merchant), key)) : undefined;
    const merchant = known?.merchant ?? cleaned;
    const transfer = looksLikeTransfer(r.description);
    return {
      key: rowFingerprint(r, rowCard, n),
      date: r.date,
      description: r.description,
      merchant,
      amount: r.amount,
      direction: r.direction,
      kind: transfer ? "skip" : r.direction === "out" ? "purchase" : "refund",
      categoryId: transfer ? null : guessCategory(merchant, r.description, categories, memory, r.category),
      cardId: rowCard,
      match: null,
      transfer,
      linkOptions: [],
      link: null,
    };
  });

  // 2. Pair rows with entries already in the app. Each entry pairs with at most one row,
  //    so two identical coffees with one receipt logged import one and skip one.
  const pairs: { row: number; txn: ExistingTxn; score: number; level: MatchLevel }[] = [];
  rows.forEach((row, i) => {
    if (row.transfer) return;
    const kind = row.direction === "out" ? "purchase" : "refund";
    for (const t of input.existing) {
      if (t.importKey && t.importKey === row.key) {
        pairs.push({ row: i, txn: t, score: 1000, level: "imported" });
        continue;
      }
      if (t.kind !== kind || t.amount !== row.amount) continue;
      const gap = Math.abs(daysBetween(row.date, t.date));
      if (gap > MATCH_WINDOW[kind]) continue;
      // Two different cards means two different purchases.
      if (row.cardId && t.cardId && row.cardId !== t.cardId) continue;
      const sameStore = merchantsMatch(row.merchant, t.merchant) || merchantsMatch(row.description, t.merchant);
      const sameCard = !!row.cardId && row.cardId === t.cardId;
      const score = (sameStore ? 100 : 20) + (sameCard ? 10 : 0) + (10 - gap);
      pairs.push({ row: i, txn: t, score, level: sameStore ? "likely" : "possible" });
    }
  });
  pairs.sort((a, b) => b.score - a.score);
  const usedRows = new Set<number>();
  const usedTxns = new Set<string>();
  for (const p of pairs) {
    if (usedRows.has(p.row) || usedTxns.has(p.txn.id)) continue;
    usedRows.add(p.row);
    usedTxns.add(p.txn.id);
    const row = rows[p.row];
    row.match = { level: p.level, id: p.txn.id, merchant: p.txn.merchant, date: p.txn.date, amount: p.txn.amount, source: p.txn.source };
    // Already logged: skip by default. People can still import it if it's really a second purchase.
    row.kind = "skip";
  }

  // 3. Returns: find the purchase each one came from, in the app or earlier on this statement.
  const remaining = new Map<string, number>();
  const purchaseById = new Map<string, ExistingTxn>();
  for (const p of [...input.purchases, ...input.existing]) {
    if (p.kind !== "purchase" || purchaseById.has(p.id)) continue;
    purchaseById.set(p.id, p);
    remaining.set(`txn:${p.id}`, p.amount - p.refunded);
  }
  // A statement purchase that's already logged is represented by the logged entry.
  const rowPurchases = rows.filter((r) => r.direction === "out" && !r.transfer && !r.match);
  for (const r of rowPurchases) remaining.set(`row:${r.key}`, r.amount);

  const refunds = rows
    .filter((r) => r.direction === "in" && !r.transfer && r.match?.level !== "imported")
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const r of refunds) {
    const sameStore = (name: string) => merchantsMatch(r.merchant, name) || merchantsMatch(r.description, name);
    const options: (PreparedRow["linkOptions"][number] & { gap: number; exact: boolean })[] = [];
    for (const p of purchaseById.values()) {
      const gap = daysBetween(r.date, p.date);
      if (gap < -1 || gap > RETURN_WINDOW_DAYS || !sameStore(p.merchant)) continue;
      if (r.cardId && p.cardId && r.cardId !== p.cardId) continue;
      const left = remaining.get(`txn:${p.id}`) ?? 0;
      if (left < r.amount) continue;
      options.push({
        value: `txn:${p.id}`,
        label: `${p.merchant} on ${shortDate(p.date)}, ${dollars(p.amount)}`,
        remaining: left,
        gap,
        exact: p.amount === r.amount,
      });
    }
    for (const p of rowPurchases) {
      const gap = daysBetween(r.date, p.date);
      if (gap < 0 || gap > RETURN_WINDOW_DAYS || !sameStore(p.merchant)) continue;
      const left = remaining.get(`row:${p.key}`) ?? 0;
      if (left < r.amount) continue;
      options.push({
        value: `row:${p.key}`,
        label: `${p.merchant} on ${shortDate(p.date)}, ${dollars(p.amount)} (on this statement)`,
        remaining: left,
        gap,
        exact: p.amount === r.amount,
      });
    }
    options.sort((a, b) => Number(b.exact) - Number(a.exact) || a.gap - b.gap);
    r.linkOptions = options.slice(0, 6).map(({ value, label, remaining }) => ({ value, label, remaining }));
    if (r.kind === "refund" && options[0]) {
      r.link = options[0].value;
      remaining.set(options[0].value, (remaining.get(options[0].value) ?? 0) - r.amount);
      // The return comes off the purchase's category and card.
      const linked = options[0].value.startsWith("txn:")
        ? purchaseById.get(options[0].value.slice(4))
        : rows.find((x) => `row:${x.key}` === options[0].value);
      if (linked) {
        r.categoryId = linked.categoryId ?? r.categoryId;
        r.cardId = r.cardId ?? linked.cardId;
      }
    }
  }

  return rows;
}
