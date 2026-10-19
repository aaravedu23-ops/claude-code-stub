/**
 * Bank statement parsing and matching helpers. Pure functions with no server or
 * browser dependencies, so the spreadsheet reader (browser), the PDF reader
 * (server) and the duplicate check (server) all agree on the same rules.
 */

/** One line from a statement, before it's checked against what's already logged. */
export type StatementRow = {
  /** YYYY-MM-DD */
  date: string;
  /** The description exactly as the bank printed it. */
  description: string;
  /** Always positive, in cents. */
  amount: number;
  /** "out" is money leaving the account (a purchase), "in" is money coming back. */
  direction: "out" | "in";
  /** Category name suggested by the reader, if any. */
  category?: string | null;
  /** Last 4 digits of the card on this line, when the export has a card column. */
  cardLast4?: string | null;
};

// ---------- Merchant names ----------

const PROCESSOR_PREFIX =
  /^(?:(?:sq|tst|sp|pp|py|paypal|ppl|square|toast|clv|dd|ic|ipn|bt|zelle|venmo|cash app|apl|apple pay|gpay|wpy|fs|pos|ckcd|chk|ach|eft|dbt|dda|ppd|web|in|stk|fsp|sumup|izettle|zettle|shopify|shp)\s*\*\s*)+/i;

const BANK_NOISE = [
  /\b(?:debit card purchase|pos purchase|pos debit|pos withdrawal|card purchase(?: with pin)?|purchase authorized on|recurring (?:card )?payment|recurring debit|checkcard|check card|point of sale|non-pin|pin purchase|visa direct|online purchase|debit card|purchase)\b/gi,
  /\b(?:pos|ref(?:erence)?|trace|seq|auth|tran|txn|id|card)\s*(?:#|no\.?)?\s*[\w-]*\d[\w-]*/gi,
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, // embedded dates
  /\b(?:x+|\*+)\d{2,4}\b/gi, // masked card numbers
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, // phone numbers
  /\.(?:com|net|org|co|io)\b(?:\/\S*)?/gi, // ".com" endings
  /\bwww\./gi,
  /#\s?\d+/g, // store numbers
  /\b(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{5,}\b/gi, // reference codes like 2K4AB1C23
  /\b\d{3,}\b/g, // long numbers
];

const US_STATES =
  /\s+(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)(?:\s+(?:US|USA))?$/i;

const BIG_CITIES =
  /\s+(?:new york|san francisco|los angeles|san jose|san diego|las vegas|salt lake city|kansas city|st\.? louis|saint louis|new orleans|fort worth|el paso|oklahoma city|santa monica|santa clara|palo alto|mountain view|long beach|jersey city|washington|brooklyn|chicago|seattle|boston|austin|houston|dallas|denver|portland|atlanta|miami|phoenix|philadelphia|oakland|berkeley)$/i;

/** Big merchants whose statement descriptions rarely look like their names. */
const BRANDS: [RegExp, string][] = [
  [/\bamzn\s*prime|amazon\s*prime|prime\s*video\b/i, "Amazon Prime"],
  [/\bamzn\b|\bamazon\b/i, "Amazon"],
  [/\buber\s*\*?\s*eats\b/i, "Uber Eats"],
  [/\buber\b/i, "Uber"],
  [/\blyft\b/i, "Lyft"],
  [/\bdoordash\b/i, "DoorDash"],
  [/\bgrubhub\b/i, "Grubhub"],
  [/\binstacart\b/i, "Instacart"],
  [/\bnetflix\b/i, "Netflix"],
  [/\bspotify\b/i, "Spotify"],
  [/\bhulu\b/i, "Hulu"],
  [/\bdisney\s*plus\b|\bdisneyplus\b/i, "Disney+"],
  [/\bapple\.com\/bill|\bapple\s*services\b|\bitunes\b/i, "Apple"],
  [/\bgoogle\b/i, "Google"],
  [/\bstarbucks\b|\bsbux\b/i, "Starbucks"],
  [/\bwholefds\b|\bwhole\s*foods\b|\bwfm\b/i, "Whole Foods"],
  [/\btrader\s*joe/i, "Trader Joe's"],
  [/\bwal-?mart\b|\bwm\s*supercenter\b/i, "Walmart"],
  [/\btarget\b/i, "Target"],
  [/\bcostco\b/i, "Costco"],
  [/\bwalgreens\b/i, "Walgreens"],
  [/\bcvs\b/i, "CVS"],
  [/\bmcdonald/i, "McDonald's"],
  [/\bchipotle\b/i, "Chipotle"],
  [/\bshell\s+(?:oil|service)\b/i, "Shell"],
  [/\bchevron\b/i, "Chevron"],
  [/\bexxon(?:mobil)?\b/i, "Exxon"],
  [/\bhome\s*depot\b/i, "The Home Depot"],
  [/\blowe'?s\b/i, "Lowe's"],
  [/\bbest\s*buy\b/i, "Best Buy"],
  [/\bsafeway\b/i, "Safeway"],
  [/\bkroger\b/i, "Kroger"],
  [/\bikea\b/i, "IKEA"],
];

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|[\s\-/&.'])([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/'S\b/g, "'s");
}

/**
 * "SQ *BLUE BOTTLE COFFEE 415-555-0134 OAKLAND CA" → "Blue Bottle Coffee". Good
 * enough to recognize a store; people can still edit it before importing.
 */
export function cleanMerchant(description: string): string {
  const raw = description.replace(/\s+/g, " ").trim();
  // Skip brand lookup for transfers so "PAYMENT TO AMAZON STORE CARD" stays readable.
  const brand = looksLikeTransfer(raw) ? undefined : BRANDS.find(([re]) => re.test(raw));
  if (brand) return brand[1];

  let s = raw.replace(PROCESSOR_PREFIX, "");
  for (const re of BANK_NOISE) s = s.replace(re, " ");
  s = s.replace(/[*_|~^=<>{}[\]\\]+/g, " ").replace(/\s+/g, " ").trim();
  // "JOE S" → "JOE'S"
  s = s.replace(/\b([A-Za-z]{2,}) S\b/g, "$1'S");
  // Trailing "CITY ST": drop the state, then the city.
  const hadState = US_STATES.test(s);
  s = s.replace(US_STATES, "").trim();
  if (BIG_CITIES.test(s)) s = s.replace(BIG_CITIES, "").trim();
  else if (hadState && s.split(" ").length >= 4) s = s.replace(/\s+\S+$/, "");
  s = s.replace(/\s+(?:US|USA|INC|LLC)$/i, "").replace(/[\s,.:;-]+$/, "").replace(/^[\s,.:;-]+/, "");
  if (!/[A-Za-z]{2}/.test(s)) s = raw;
  s = s.slice(0, 60).trim();
  return s === s.toUpperCase() ? titleCase(s) : s;
}

const STOP_WORDS = new Set([
  "the", "and", "inc", "llc", "ltd", "co", "corp", "company", "store", "stores", "shop", "market", "usa", "us",
  "com", "www", "online", "payment", "purchase", "debit", "credit", "card", "pos", "of", "at", "to", "for",
]);

/** Lowercase words that identify a store, without filler like "inc" or "store". */
export function merchantTokens(name: string): string[] {
  return cleanMerchant(name)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t) && !/^\d+$/.test(t));
}

/** A comparable key for a store name: "Trader Joe's #552" and "TRADER JOE S" both become "traderjoes". */
export function merchantKey(name: string): string {
  return merchantTokens(name).join("");
}

/**
 * Whether two store names are the same place. Statement descriptions are
 * messy ("AMZN Mktp US*2K4" vs "Amazon"), so this matches on a shared
 * distinctive word or one name containing the other.
 */
export function merchantsMatch(a: string, b: string): boolean {
  const ka = merchantKey(a);
  const kb = merchantKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if ((ka.length >= 4 && kb.includes(ka)) || (kb.length >= 4 && ka.includes(kb))) return true;
  const ta = merchantTokens(a).map(alias);
  const tb = new Set(merchantTokens(b).map(alias));
  return ta.some((t) => t.length >= 4 && tb.has(t)) || (ta[0] !== undefined && ta[0].length >= 3 && tb.has(ta[0]));
}

/** Common abbreviations banks use for big merchants. */
function alias(token: string) {
  const map: Record<string, string> = {
    amzn: "amazon", amazoncom: "amazon", wm: "walmart", wal: "walmart", wmt: "walmart", tgt: "target",
    mcdonalds: "mcdonalds", mcd: "mcdonalds", sbux: "starbucks", cvs: "cvs", wholefds: "whole", wfm: "whole",
    tjs: "traderjoes", traderjoe: "traderjoes", costco: "costco", nflx: "netflix", spotifyusa: "spotify",
  };
  return map[token] ?? token;
}

// ---------- What isn't spending ----------

/** Card payments, transfers, paychecks and interest: real money movement, but not a purchase or a return. */
const NOT_SPENDING =
  /\b(?:payment\s*(?:-\s*)?thank\s*you|thank\s*you\s*for\s*(?:your\s*)?payment|autopay|auto\s*pay|automatic\s*payment|online\s*payment|mobile\s*payment|payment\s*received|card\s*payment|credit\s*card\s*(?:payment|pmt)|epay|e-payment|transfer|xfer|trnsfr|online\s*banking\s*transfer|from\s*(?:checking|savings)|to\s*(?:checking|savings)|payroll|direct\s*dep(?:osit)?|dir\s*dep|salary|deposit|mobile\s*deposit|atm\s*(?:deposit|withdrawal|cash)|cash\s*withdrawal|interest\s*(?:paid|payment|earned|charge)|dividend|balance\s*transfer|beginning\s*balance|ending\s*balance|previous\s*balance|new\s*balance)\b/i;

export function looksLikeTransfer(description: string) {
  return NOT_SPENDING.test(description);
}

// ---------- Dates and amounts ----------

const MONTHS = "janfebmaraprmayjunjulaugsepoctnovdec";
const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Reads a date cell or string. `dayFirst` switches 03/04 to 3 April.
 * `fallbackYear` fills in statements that print only month and day.
 */
export function parseStatementDate(value: unknown, opts: { dayFirst?: boolean; fallbackYear?: number } = {}): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Spreadsheet dates can land a few seconds before midnight; nudge to midday first.
    const d = new Date(value.getTime() + 12 * 3600 * 1000);
    return validDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  if (typeof value === "number" && value > 20000 && value < 80000) {
    // Excel serial date (days since 1899-12-30).
    const d = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return validDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (typeof value !== "string") return null;
  const s = value.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return opts.dayFirst ? validDate(y, +m[2], +m[1]) : validDate(y, +m[1], +m[2]);
  }
  m = s.match(/^(\d{1,2})[-\s.]([A-Za-z]{3})[a-z]*\.?[-\s.,]+(\d{2,4})\b/);
  if (m && MONTHS.includes(m[2].toLowerCase())) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return validDate(y, MONTHS.indexOf(m[2].toLowerCase()) / 3 + 1, +m[1]);
  }
  m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\b/);
  if (m && MONTHS.includes(m[1].toLowerCase()) && MONTHS.indexOf(m[1].toLowerCase()) % 3 === 0) {
    const y = m[3] ? +m[3] : opts.fallbackYear;
    return y ? validDate(y, MONTHS.indexOf(m[1].toLowerCase()) / 3 + 1, +m[2]) : null;
  }
  m = s.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (m && opts.fallbackYear) {
    return opts.dayFirst ? validDate(opts.fallbackYear, +m[2], +m[1]) : validDate(opts.fallbackYear, +m[1], +m[2]);
  }
  return null;
}

/**
 * "$1,204.99" → 120499, "(12.50)" / "-12.50" / "12.50-" / "12.50 CR" → -1250.
 * Returns null for anything that isn't an amount.
 */
export function parseStatementAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : null;
  if (typeof value !== "string") return null;
  let s = value.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/\b(?:CR|CREDIT)\.?$/i.test(s)) {
    negative = true;
    s = s.replace(/\b(?:CR|CREDIT)\.?$/i, "");
  } else s = s.replace(/\b(?:DR|DEBIT)\.?$/i, "");
  s = s.trim();
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-") || s.startsWith("−")) {
    negative = !negative;
    s = s.slice(1);
  }
  s = s.replace(/^\+/, "").replace(/[$€£¥\s]/g, "").replace(/^[A-Z]{3}/, "");
  // 1.234,56 (European) → 1234.56
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s) && !/^\.\d{1,2}$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return negative ? -cents : cents;
}

// ---------- Spreadsheets (CSV / Excel) ----------

export type ColumnMapping = {
  /** Index of the header row; data starts on the next row. -1 when there is no header. */
  headerRow: number;
  date: number;
  description: number;
  /** A single signed amount column... */
  amount: number | null;
  /** ...or separate money-out and money-in columns. */
  debit: number | null;
  credit: number | null;
  /** Optional "Debit"/"Credit" or "Sale"/"Return" column that says which way money moved. */
  type: number | null;
  /** Optional card number column (some card exports list several cards). */
  card: number | null;
  /** For a single amount column: whether purchases appear as negative numbers. */
  purchasesNegative: boolean;
  dayFirst: boolean;
};

type Cell = unknown;

const H = {
  date: /^(?:trans(?:action)?\.?\s*date|date|posted\s*date|post(?:ing)?\s*date|booking\s*date|value\s*date|date\s*posted|transaction\s*date)$/i,
  dateLoose: /date/i,
  description: /^(?:description|desc|details|transaction\s*description|merchant|merchant\s*name|payee|name|memo|narrative|transaction|particulars|reference|original\s*description)$/i,
  descriptionLoose: /descr|merchant|payee|detail|memo|narrat|name/i,
  amount: /^(?:amount|amt|transaction\s*amount|amount\s*\(\w+\)|value|net\s*amount|billing\s*amount)$/i,
  debit: /^(?:debit|debits|withdrawal|withdrawals|money\s*out|paid\s*out|spent|charge|charges|debit\s*amount|withdrawal\s*amount|outflow)$/i,
  credit: /^(?:credit|credits|deposit|deposits|money\s*in|paid\s*in|received|payment|payments|credit\s*amount|deposit\s*amount|inflow)$/i,
  type: /^(?:type|transaction\s*type|trans\.?\s*type|debit\/credit|dr\/cr|cr\/dr|details)$/i,
  card: /^(?:card(?:\s*no\.?|\s*number|\s*#)?|card\s*member|account\s*number|last\s*4)$/i,
};

const text = (c: Cell) => (c === null || c === undefined ? "" : c instanceof Date ? c.toISOString() : String(c)).trim();

/** Finds the header row and which column holds what. Returns null when no date and amount columns can be found. */
export function detectColumns(grid: Cell[][]): ColumnMapping | null {
  const scan = Math.min(grid.length, 25);
  let best: { row: number; score: number } | null = null;
  for (let r = 0; r < scan; r++) {
    const cells = (grid[r] ?? []).map(text);
    let score = 0;
    if (cells.some((c) => H.date.test(c) || H.dateLoose.test(c))) score += 2;
    if (cells.some((c) => H.description.test(c) || H.descriptionLoose.test(c))) score += 1;
    if (cells.some((c) => H.amount.test(c) || H.debit.test(c) || H.credit.test(c))) score += 2;
    if (score >= 4 && (!best || score > best.score)) best = { row: r, score };
  }

  const mapping: ColumnMapping = {
    headerRow: -1,
    date: -1,
    description: -1,
    amount: null,
    debit: null,
    credit: null,
    type: null,
    card: null,
    purchasesNegative: true,
    dayFirst: false,
  };

  if (best) {
    const headers = (grid[best.row] ?? []).map(text);
    const find = (strict: RegExp, loose?: RegExp, taken: number[] = []) => {
      let i = headers.findIndex((h, j) => strict.test(h) && !taken.includes(j));
      if (i < 0 && loose) i = headers.findIndex((h, j) => loose.test(h) && !taken.includes(j));
      return i;
    };
    mapping.headerRow = best.row;
    mapping.date = find(H.date, H.dateLoose);
    mapping.amount = nullIfMissing(find(H.amount, undefined, [mapping.date]));
    mapping.debit = nullIfMissing(find(H.debit, undefined, [mapping.date]));
    mapping.credit = nullIfMissing(find(H.credit, undefined, [mapping.date, mapping.debit ?? -1]));
    const taken = [mapping.date, mapping.amount ?? -1, mapping.debit ?? -1, mapping.credit ?? -1];
    mapping.description = find(H.description, H.descriptionLoose, taken);
    mapping.type = nullIfMissing(find(H.type, undefined, [...taken, mapping.description]));
    mapping.card = nullIfMissing(find(H.card, undefined, [...taken, mapping.description]));
    // Prefer debit/credit columns only when there's no single amount column.
    if (mapping.amount !== null) {
      mapping.debit = null;
      mapping.credit = null;
    }
  } else {
    // No header: guess from the first rows' contents.
    const sample = grid.slice(0, 10).filter((r) => r && r.length >= 2);
    if (!sample.length) return null;
    const width = Math.max(...sample.map((r) => r.length));
    const share = (col: number, test: (c: Cell) => boolean) => sample.filter((r) => test(r[col])).length / sample.length;
    for (let c = 0; c < width; c++) {
      if (mapping.date < 0 && share(c, (v) => parseStatementDate(v) !== null) >= 0.6) mapping.date = c;
    }
    for (let c = width - 1; c >= 0; c--) {
      if (c !== mapping.date && mapping.amount === null && share(c, (v) => parseStatementAmount(v) !== null && /[.\d]/.test(text(v))) >= 0.6)
        mapping.amount = c;
    }
    let longest = -1;
    for (let c = 0; c < width; c++) {
      if (c === mapping.date || c === mapping.amount) continue;
      const len = sample.reduce((s, r) => s + text(r[c]).length, 0);
      if (len > longest && share(c, (v) => /[A-Za-z]{3}/.test(text(v))) >= 0.5) {
        longest = len;
        mapping.description = c;
      }
    }
  }

  if (mapping.date < 0 || (mapping.amount === null && mapping.debit === null && mapping.credit === null)) return null;

  // Day-first dates: any first number over 12 settles it.
  const dataRows = grid.slice(mapping.headerRow + 1, mapping.headerRow + 400);
  mapping.dayFirst = dataRows.some((r) => {
    const m = text(r?.[mapping.date]).match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    return !!m && +m[1] > 12 && +m[2] <= 12;
  });

  // Single amount column: most rows on a statement are purchases, so the more common sign is "spending".
  if (mapping.amount !== null) {
    let neg = 0;
    let pos = 0;
    for (const r of dataRows) {
      const a = parseStatementAmount(r?.[mapping.amount]);
      if (a === null || a === 0) continue;
      if (a < 0) neg++;
      else pos++;
    }
    mapping.purchasesNegative = neg >= pos;
  }
  return mapping;
}

function nullIfMissing(i: number) {
  return i < 0 ? null : i;
}

/** Turns spreadsheet rows into statement rows using a column mapping. Rows that don't parse are counted, not guessed. */
export function rowsFromGrid(grid: Cell[][], mapping: ColumnMapping): { rows: StatementRow[]; skipped: number } {
  const rows: StatementRow[] = [];
  let skipped = 0;
  for (const r of grid.slice(mapping.headerRow + 1)) {
    if (!r || r.every((c) => text(c) === "")) continue;
    const date = parseStatementDate(r[mapping.date], { dayFirst: mapping.dayFirst });
    const description = mapping.description >= 0 ? text(r[mapping.description]).replace(/\s+/g, " ") : "";
    let signed: number | null = null; // positive = money out
    if (mapping.amount !== null) {
      const a = parseStatementAmount(r[mapping.amount]);
      if (a !== null) signed = mapping.purchasesNegative ? -a : a;
    } else {
      const out = mapping.debit !== null ? parseStatementAmount(r[mapping.debit]) : null;
      const inn = mapping.credit !== null ? parseStatementAmount(r[mapping.credit]) : null;
      if (out) signed = Math.abs(out);
      else if (inn) signed = -Math.abs(inn);
    }
    // A type column like "Debit"/"Credit" or "Sale"/"Return" overrides the sign.
    if (signed !== null && mapping.type !== null) {
      const t = text(r[mapping.type]).toLowerCase();
      if (/^(?:credit|cr|return|refund|deposit|payment|adjustment credit)\b/.test(t)) signed = -Math.abs(signed);
      else if (/^(?:debit|dr|sale|purchase|withdrawal|fee)\b/.test(t)) signed = Math.abs(signed);
    }
    if (!date || signed === null || signed === 0 || !description) {
      skipped++;
      continue;
    }
    const cardLast4 = mapping.card !== null ? (text(r[mapping.card]).match(/(\d{4})\D*$/)?.[1] ?? null) : null;
    rows.push({ date, description: description.slice(0, 200), amount: Math.abs(signed), direction: signed > 0 ? "out" : "in", cardLast4 });
  }
  return { rows, skipped };
}

// ---------- PDF text (used when receipt AI isn't set up) ----------

const LINE_AMOUNT = /(-|−)?\$?\(?(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})\)?(-|\s?CR\b)?/gi;

/**
 * Reads transactions out of a statement's plain text: lines that start with a
 * date and end with an amount. Section headings ("Payments and credits",
 * "Deposits") decide which way money moved when the line doesn't say.
 */
export function rowsFromText(raw: string, today = new Date()): StatementRow[] {
  const lines = raw.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

  // Statement period end: the latest full date printed anywhere, used to fill in missing years.
  let end: Date | null = null;
  for (const m of raw.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b|\b([A-Z][a-z]{2})[a-z]*\.? (\d{1,2}), (\d{4})\b/g)) {
    const iso = m[1] ? parseStatementDate(m[0]) : parseStatementDate(`${m[4]} ${m[5]}, ${m[6]}`);
    if (!iso) continue;
    const d = new Date(`${iso}T12:00`);
    if (d <= today && (!end || d > end)) end = d;
  }
  const endYear = (end ?? today).getFullYear();
  const endMonth = (end ?? today).getMonth() + 1;

  let section: "out" | "in" | null = null;
  const rows: StatementRow[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!/\d\.\d{2}/.test(line) || /^(?:total|subtotal)\b/i.test(line)) {
      if (/payments?(?:,| and) (?:other )?credits|credits?\b.*\breturns?|deposits?(?: and (?:other )?(?:additions|credits))?|additions|money in/.test(lower)) section = "in";
      else if (/\bpurchases?\b|withdrawals|debits|charges|checks paid|\bfees\b|money out|card transactions|spending/.test(lower)) section = "out";
      continue;
    }
    const dm = line.match(/^(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|[A-Z][a-z]{2}\.? \d{1,2}(?:, \d{4})?|\d{4}-\d{2}-\d{2})\s+/);
    if (!dm) continue;
    let rest = line.slice(dm[0].length);
    // A second date right after the first is the posting date.
    rest = rest.replace(/^(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|[A-Z][a-z]{2}\.? \d{1,2})\s+/, "");
    const amounts = [...rest.matchAll(LINE_AMOUNT)];
    if (!amounts.length) continue;
    // With two amounts on a line, the last is usually the running balance.
    const pick = amounts.length >= 2 && section !== null ? amounts[amounts.length - 2] : amounts[amounts.length - 1];
    const cents = Number(pick[2].replace(/,/g, "")) * 100 + Number(pick[3]);
    if (!cents) continue;
    const negative = !!pick[1] || /\(/.test(pick[0]) || !!pick[4];
    const description = rest.slice(0, pick.index).replace(/\s+/g, " ").trim();
    if (!/[A-Za-z]{2}/.test(description)) continue;

    let date = parseStatementDate(dm[1], { fallbackYear: endYear });
    if (date && !/\d{4}/.test(dm[1])) {
      // Dec transactions on a Jan statement belong to last year.
      const month = Number(date.slice(5, 7));
      if (month > endMonth) date = `${endYear - 1}${date.slice(4)}`;
    }
    if (!date) continue;

    const direction: "out" | "in" = negative ? "in" : (section ?? "out");
    rows.push({ date, description: description.slice(0, 200), amount: cents, direction });
  }
  return rows;
}

// ---------- Fingerprints ----------

/**
 * A stable key for a statement row, so importing the same statement (or an
 * overlapping one) twice never adds it again. The occurrence number keeps two
 * identical coffees on the same day apart.
 */
export function rowFingerprint(row: Pick<StatementRow, "date" | "amount" | "direction" | "description">, cardId: string | null, occurrence: number) {
  const desc = row.description.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 48);
  return `${row.date}|${row.direction}|${row.amount}|${desc}|${cardId ?? "-"}|${occurrence}`;
}

export function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${a}T12:00`).getTime() - new Date(`${b}T12:00`).getTime()) / 86400000);
}
