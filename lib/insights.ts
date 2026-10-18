import { prisma } from "@/lib/db";
import { money, monthLabel, monthRange, shiftMonth } from "@/lib/format";

type Txn = {
  id: string;
  kind: string;
  amount: number;
  merchant: string;
  date: Date;
  categoryId: string | null;
  cardId: string | null;
  originalId?: string | null;
};

type CategoryInfo = { id: string; name: string; color: string; icon: string; budget: number | null };
type CardInfo = { id: string; nickname: string; last4: string; color: string };

export type CategoryTotal = CategoryInfo & { net: number; count: number };

export type MonthSummary = {
  spent: number;
  refunded: number;
  net: number;
  purchaseCount: number;
  refundCount: number;
  byCategory: CategoryTotal[];
  byCard: (CardInfo & { net: number })[];
  merchants: { name: string; net: number; count: number }[];
  largest: Txn | null;
  weekendShare: number;
  smallPurchases: { count: number; total: number };
};

export type Insight = {
  id: string;
  tone: "good" | "watch" | "neutral";
  headline: string;
  detail?: string;
};

const UNCATEGORIZED: CategoryInfo = {
  id: "none",
  name: "Uncategorized",
  color: "#9AA1AD",
  icon: "other",
  budget: null,
};

export function summarize(txns: Txn[], categories: CategoryInfo[], cards: CardInfo[]): MonthSummary {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const cardMap = new Map(cards.map((c) => [c.id, c]));
  const byCat = new Map<string, CategoryTotal>();
  const byCard = new Map<string, CardInfo & { net: number }>();
  const merchants = new Map<string, { name: string; net: number; count: number }>();

  let spent = 0;
  let refunded = 0;
  let purchaseCount = 0;
  let refundCount = 0;
  let weekend = 0;
  let largest: Txn | null = null;
  const small = { count: 0, total: 0 };

  // Returns linked to a purchase in this set, so "largest purchase" means what you kept.
  const returned = new Map<string, number>();
  for (const t of txns) {
    if (t.kind === "refund" && t.originalId) returned.set(t.originalId, (returned.get(t.originalId) ?? 0) + t.amount);
  }

  for (const t of txns) {
    const signed = t.kind === "refund" ? -t.amount : t.amount;
    if (t.kind === "refund") {
      refunded += t.amount;
      refundCount++;
    } else {
      spent += t.amount;
      purchaseCount++;
      const kept = t.amount - (returned.get(t.id) ?? 0);
      if (kept > 0 && (!largest || kept > largest.amount)) largest = { ...t, amount: kept };
      if (t.amount < 1000) {
        small.count++;
        small.total += t.amount;
      }
      const day = t.date.getDay();
      if (day === 0 || day === 6) weekend += t.amount;
    }

    const cat = (t.categoryId && catMap.get(t.categoryId)) || UNCATEGORIZED;
    const ct = byCat.get(cat.id) ?? { ...cat, net: 0, count: 0 };
    ct.net += signed;
    if (t.kind !== "refund") ct.count++;
    byCat.set(cat.id, ct);

    const card = t.cardId ? cardMap.get(t.cardId) : undefined;
    if (card) {
      const cd = byCard.get(card.id) ?? { ...card, net: 0 };
      cd.net += signed;
      byCard.set(card.id, cd);
    }

    const key = t.merchant.trim().toLowerCase();
    const m = merchants.get(key) ?? { name: t.merchant.trim(), net: 0, count: 0 };
    m.net += signed;
    if (t.kind !== "refund") m.count++;
    merchants.set(key, m);
  }

  return {
    spent,
    refunded,
    net: spent - refunded,
    purchaseCount,
    refundCount,
    byCategory: [...byCat.values()].filter((c) => c.net !== 0 || c.count > 0).sort((a, b) => b.net - a.net),
    byCard: [...byCard.values()].sort((a, b) => b.net - a.net),
    merchants: [...merchants.values()].sort((a, b) => b.net - a.net),
    largest,
    weekendShare: spent > 0 ? weekend / spent : 0,
    smallPurchases: small,
  };
}

async function loadMonth(userId: string, start: Date) {
  const { from, to } = monthRange(start);
  return prisma.transaction.findMany({
    where: { userId, date: { gte: from, lt: to } },
    select: { id: true, kind: true, amount: true, merchant: true, date: true, categoryId: true, cardId: true, originalId: true },
  });
}

function changePct(now: number, before: number) {
  if (before <= 0) return null;
  return (now - before) / before;
}

export async function getMonthInsights(userId: string, start: Date, today = new Date()) {
  const [categories, cards] = await Promise.all([
    prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true, color: true, icon: true, budget: true },
    }),
    prisma.paymentCard.findMany({
      where: { userId },
      select: { id: true, nickname: true, last4: true, color: true },
    }),
  ]);

  const months = await Promise.all([0, 1, 2, 3].map((i) => loadMonth(userId, shiftMonth(start, -i))));
  const [current, prev, ...older] = months.map((m) => summarize(m, categories, cards));

  const name = monthLabel(start).split(" ")[0];
  const prevName = monthLabel(shiftMonth(start, -1)).split(" ")[0];
  const insights: Insight[] = [];

  const { from, to } = monthRange(start);
  const isCurrent = today >= from && today < to;
  const daysInMonth = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  const daysElapsed = isCurrent ? today.getDate() : daysInMonth;
  const daysLeft = daysInMonth - daysElapsed;

  if (current.purchaseCount === 0 && current.refundCount === 0) {
    return { summary: current, previous: prev, insights, isCurrent, daysLeft };
  }

  // 1. Overall spend against last month (or pace, mid-month).
  const change = changePct(current.net, prev.net);
  if (isCurrent && daysElapsed < daysInMonth && daysElapsed >= 5) {
    const projected = Math.round((current.net / daysElapsed) * daysInMonth);
    const vs = prev.net > 0 ? changePct(projected, prev.net) : null;
    insights.push({
      id: "pace",
      tone: vs !== null && vs > 0.1 ? "watch" : "neutral",
      headline: `You're on pace to spend about ${money(projected, { round: true })} in ${name}.`,
      detail:
        vs !== null
          ? `That would be ${Math.abs(Math.round(vs * 100))}% ${vs >= 0 ? "more" : "less"} than ${prevName}'s ${money(prev.net, { round: true })}.`
          : `${money(current.net)} so far, with ${daysLeft} days to go.`,
    });
  } else if (change !== null) {
    insights.push({
      id: "total",
      tone: change <= 0 ? "good" : change > 0.15 ? "watch" : "neutral",
      headline: `You spent ${money(current.net, { round: true })} in ${name}, ${Math.abs(Math.round(change * 100))}% ${change <= 0 ? "less" : "more"} than ${prevName}.`,
    });
  } else {
    insights.push({
      id: "total",
      tone: "neutral",
      headline: `You spent ${money(current.net, { round: true })} in ${name} across ${current.purchaseCount} purchases.`,
    });
  }

  // 2. Three-month average, once there's enough history.
  const history = [prev, ...older].filter((m) => m.purchaseCount > 0);
  if (!isCurrent && history.length >= 2) {
    const avg = history.reduce((s, m) => s + m.net, 0) / history.length;
    const diff = current.net - avg;
    if (Math.abs(diff) > avg * 0.08) {
      insights.push({
        id: "average",
        tone: diff < 0 ? "good" : "neutral",
        headline: `That's ${money(Math.abs(diff), { round: true })} ${diff < 0 ? "below" : "above"} your ${history.length}-month average.`,
      });
    }
  }

  // 3. Budgets.
  for (const c of current.byCategory) {
    if (!c.budget || c.budget <= 0) continue;
    const used = c.net / c.budget;
    if (used > 1) {
      insights.push({
        id: `over-${c.id}`,
        tone: "watch",
        headline: `${c.name} is ${money(c.net - c.budget, { round: true })} over its ${money(c.budget, { round: true })} budget.`,
      });
    } else if (isCurrent && used >= 0.85) {
      insights.push({
        id: `near-${c.id}`,
        tone: "watch",
        headline: `${c.name} has used ${Math.round(used * 100)}% of its budget with ${daysLeft} days left.`,
      });
    }
  }
  const budgeted = current.byCategory.filter((c) => c.budget && c.budget > 0);
  if (!isCurrent && budgeted.length > 0 && budgeted.every((c) => c.net <= (c.budget ?? 0))) {
    insights.push({ id: "budgets-ok", tone: "good", headline: `Every budgeted category stayed on budget in ${name}.` });
  }

  // 4. Biggest category moves against last month.
  const prevByCat = new Map(prev.byCategory.map((c) => [c.id, c.net]));
  const moves = current.byCategory
    .map((c) => ({ c, delta: c.net - (prevByCat.get(c.id) ?? 0), before: prevByCat.get(c.id) ?? 0 }))
    .filter((m) => m.before > 0 || prev.purchaseCount > 0);
  const up = [...moves].sort((a, b) => b.delta - a.delta)[0];
  if (!isCurrent && up && up.delta > 2500) {
    insights.push({
      id: "cat-up",
      tone: "watch",
      headline: `${up.c.name} went up ${money(up.delta, { round: true })} compared with ${prevName}.`,
      detail: `${money(up.before, { round: true })} → ${money(up.c.net, { round: true })}`,
    });
  }
  const dropped = prev.byCategory
    .map((p) => ({ p, now: current.byCategory.find((c) => c.id === p.id)?.net ?? 0 }))
    .map((x) => ({ ...x, delta: x.p.net - x.now }))
    .sort((a, b) => b.delta - a.delta)[0];
  if (!isCurrent && dropped && dropped.delta > 2500) {
    insights.push({
      id: "cat-down",
      tone: "good",
      headline: `You spent ${money(dropped.delta, { round: true })} less on ${dropped.p.name} than in ${prevName}.`,
    });
  }

  // 5. Where the money went.
  const top = current.byCategory[0];
  if (top && current.net > 0 && top.net > 0) {
    insights.push({
      id: "top-cat",
      tone: "neutral",
      headline: `${top.name} was your biggest category at ${Math.round((top.net / current.net) * 100)}% of spending.`,
    });
  }
  const regular = current.merchants.find((m) => m.count >= 3);
  if (regular) {
    insights.push({
      id: "regular",
      tone: "neutral",
      headline: `You went to ${regular.name} ${regular.count} times, ${money(regular.net)} in total.`,
    });
  }
  if (current.smallPurchases.count >= 5 && current.smallPurchases.total >= 4000) {
    insights.push({
      id: "small",
      tone: "neutral",
      headline: `${current.smallPurchases.count} purchases under $10 added up to ${money(current.smallPurchases.total)}.`,
    });
  }
  if (current.largest && current.purchaseCount >= 3) {
    insights.push({
      id: "largest",
      tone: "neutral",
      headline: `Your largest purchase was ${money(current.largest.amount)} at ${current.largest.merchant}.`,
      detail: current.largest.date.toLocaleDateString("en-US", { month: "long", day: "numeric" }),
    });
  }
  if (current.purchaseCount >= 6 && current.weekendShare >= 0.5) {
    insights.push({
      id: "weekend",
      tone: "neutral",
      headline: `${Math.round(current.weekendShare * 100)}% of your spending happened on weekends.`,
    });
  }
  const mainCard = current.byCard[0];
  if (mainCard && current.net > 0 && current.byCard.length > 1) {
    insights.push({
      id: "card",
      tone: "neutral",
      headline: `${Math.round((mainCard.net / current.net) * 100)}% of spending went on ${mainCard.nickname} (•${mainCard.last4}).`,
    });
  }

  // 6. Returns.
  if (current.refundCount > 0) {
    insights.push({
      id: "refunds",
      tone: "good",
      headline: `You got ${money(current.refunded)} back from ${current.refundCount} ${current.refundCount === 1 ? "return" : "returns"}.`,
    });
  }

  return { summary: current, previous: prev, insights, isCurrent, daysLeft };
}
