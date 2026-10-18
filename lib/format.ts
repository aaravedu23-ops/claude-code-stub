const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdRound = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function money(cents: number, opts?: { round?: boolean }) {
  return (opts?.round ? usdRound : usd).format(cents / 100);
}

/** "12.5", "$1,204.99" → 1250, 120499. Returns null when it isn't a number. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

/** Month keys look like "2026-10". */
export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function parseMonthKey(key: string | undefined | null): Date {
  const m = key?.match(/^(\d{4})-(\d{2})$/);
  if (!m) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, 1);
}

export function monthRange(start: Date) {
  const from = new Date(start.getFullYear(), start.getMonth(), 1);
  const to = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return { from, to };
}

export function shiftMonth(start: Date, by: number) {
  return new Date(start.getFullYear(), start.getMonth() + by, 1);
}

export function monthLabel(d: Date, opts?: { short?: boolean }) {
  return d.toLocaleDateString("en-US", {
    month: opts?.short ? "short" : "long",
    year: "numeric",
  });
}

/** Dates are stored at local noon so time zones never push them into another day. */
export function dateFromInput(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}

export function dateToInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayLabel(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}
