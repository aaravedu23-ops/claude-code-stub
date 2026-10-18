import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { dateToInput, monthRange } from "@/lib/format";
import type { EditableTxn } from "@/lib/types";
import type { TxnRowData } from "@/components/stub/txn-row";

const txnInclude = {
  category: { select: { name: true, color: true, icon: true } },
  card: { select: { nickname: true, last4: true } },
  refunds: { select: { amount: true } },
} as const;

type LoadedTxn = Awaited<ReturnType<typeof loadTxns>>[number];

async function loadTxns(where: Prisma.TransactionWhereInput, take?: number) {
  return prisma.transaction.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take,
    // The receipt image is large, so lists only ask whether there is one.
    select: {
      id: true,
      kind: true,
      amount: true,
      merchant: true,
      date: true,
      note: true,
      items: true,
      categoryId: true,
      cardId: true,
      originalId: true,
      ...txnInclude,
    },
  });
}

export type ListedTxn = { row: TxnRowData; edit: EditableTxn };

function toListed(t: LoadedTxn, hasReceipt: boolean): ListedTxn {
  const refundedTotal = t.refunds.reduce((s, r) => s + r.amount, 0);
  let items: EditableTxn["items"] = [];
  try {
    items = t.items ? JSON.parse(t.items) : [];
  } catch {
    items = [];
  }
  return {
    row: {
      id: t.id,
      kind: t.kind,
      amount: t.amount,
      merchant: t.merchant,
      date: t.date.toISOString(),
      category: t.category,
      card: t.card,
      refundedTotal,
      hasReceipt,
    },
    edit: {
      id: t.id,
      kind: t.kind === "refund" ? "refund" : "purchase",
      amount: t.amount,
      merchant: t.merchant,
      date: dateToInput(t.date),
      categoryId: t.categoryId,
      cardId: t.cardId,
      originalId: t.originalId,
      note: t.note,
      items,
      hasReceipt,
      refundedTotal,
      refundCount: t.refunds.length,
    },
  };
}

async function withReceiptFlags(txns: LoadedTxn[]) {
  if (txns.length === 0) return [];
  const flagged = await prisma.transaction.findMany({
    where: { id: { in: txns.map((t) => t.id) }, receiptImage: { not: null } },
    select: { id: true },
  });
  const set = new Set(flagged.map((f) => f.id));
  return txns.map((t) => toListed(t, set.has(t.id)));
}

export async function listMonthTxns(
  userId: string,
  start: Date,
  filters: { categoryId?: string; cardId?: string; kind?: string; q?: string } = {},
  take?: number,
) {
  const { from, to } = monthRange(start);
  const txns = await loadTxns(
    {
      userId,
      date: { gte: from, lt: to },
      ...(filters.categoryId ? { categoryId: filters.categoryId === "none" ? null : filters.categoryId } : {}),
      ...(filters.cardId ? { cardId: filters.cardId === "none" ? null : filters.cardId } : {}),
      ...(filters.kind === "purchase" || filters.kind === "refund" ? { kind: filters.kind } : {}),
      ...(filters.q ? {
            OR: [
              { merchant: { contains: filters.q, mode: "insensitive" as const } },
              { note: { contains: filters.q, mode: "insensitive" as const } },
            ],
          } : {}),
    },
    take,
  );
  return withReceiptFlags(txns);
}
