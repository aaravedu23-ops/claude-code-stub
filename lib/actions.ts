"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CATEGORY_ICONS, CARD_NETWORKS } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { dateFromInput, dateToInput, monthKey, parseMoney, shiftMonth } from "@/lib/format";
import type { ReturnablePurchase } from "@/lib/types";
import { sendMonthlyReport } from "@/lib/report";
import { requireUser } from "@/lib/session";
import { merchantsMatch, type StatementRow } from "@/lib/statement";
import { MATCH_WINDOW, RETURN_WINDOW_DAYS, prepareRows, type ExistingTxn, type PreparedRow } from "@/lib/statement-match";

/** An entry already logged that looks like the one being saved. */
export type DuplicateHint = {
  id: string;
  merchant: string;
  /** YYYY-MM-DD */
  date: string;
  amount: number;
  source: string;
  hasReceipt: boolean;
};

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string; duplicate?: DuplicateHint };

function refresh() {
  revalidatePath("/", "layout");
}

function fail(error: string): ActionResult {
  return { ok: false, error };
}

// ---------- Transactions ----------

const itemSchema = z.object({ name: z.string().max(120), amount: z.number().int() });

const txnSchema = z.object({
  kind: z.enum(["purchase", "refund"]),
  amount: z.string(),
  merchant: z.string().trim().min(1, "Add the store name.").max(120),
  date: z.string(),
  categoryId: z.string().optional().nullable(),
  cardId: z.string().optional().nullable(),
  originalId: z.string().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  items: z.array(itemSchema).max(100).optional().nullable(),
  receiptImage: z.string().max(1_500_000).optional().nullable(),
});

export type TransactionInput = z.input<typeof txnSchema>;

async function validateTxn(userId: string, input: TransactionInput, editingId?: string) {
  const parsed = txnSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const v = parsed.data;

  const amount = parseMoney(v.amount);
  if (amount === null || amount <= 0) return { error: "Enter an amount greater than $0." };
  const date = dateFromInput(v.date);
  if (!date) return { error: "Pick a date." };
  if (v.receiptImage && !v.receiptImage.startsWith("data:image/")) return { error: "The receipt image couldn't be read." };

  const [category, card] = await Promise.all([
    v.categoryId ? prisma.category.findFirst({ where: { id: v.categoryId, userId } }) : null,
    v.cardId ? prisma.paymentCard.findFirst({ where: { id: v.cardId, userId } }) : null,
  ]);
  if (v.categoryId && !category) return { error: "That category no longer exists." };
  if (v.cardId && !card) return { error: "That card no longer exists." };

  let originalId: string | null = null;
  let linkedCategoryId: string | null = null;
  let linkedCardId: string | null = null;
  if (v.kind === "refund" && v.originalId) {
    const original = await prisma.transaction.findFirst({
      where: { id: v.originalId, userId, kind: "purchase" },
      include: { refunds: { select: { id: true, amount: true } } },
    });
    if (!original) return { error: "The original purchase couldn't be found." };
    if (dateToInput(date) < dateToInput(original.date)) {
      return { error: "A return can't be dated before the purchase it came from." };
    }
    const alreadyBack = original.refunds
      .filter((r) => r.id !== editingId)
      .reduce((s, r) => s + r.amount, 0);
    if (amount > original.amount - alreadyBack) {
      const left = (original.amount - alreadyBack) / 100;
      return { error: `The refund can't be more than the $${left.toFixed(2)} left on that purchase.` };
    }
    originalId = original.id;
    // A linked return comes off the purchase's category and card unless others were picked.
    linkedCategoryId = original.categoryId;
    linkedCardId = original.cardId;
  }

  return {
    data: {
      kind: v.kind,
      amount,
      merchant: v.merchant,
      date,
      categoryId: category?.id ?? linkedCategoryId,
      cardId: card?.id ?? linkedCardId,
      originalId,
      note: v.note?.trim() || null,
      items: v.items && v.items.length > 0 ? JSON.stringify(v.items) : null,
    },
    receiptImage: v.receiptImage,
  };
}

/**
 * Finds an entry that's probably the same purchase or return: same amount and
 * type, a few days apart, and either the same store or imported from a bank
 * statement (whose store names rarely match a receipt's).
 */
async function findDuplicate(
  userId: string,
  d: { kind: string; amount: number; date: Date; merchant: string; cardId: string | null },
): Promise<DuplicateHint | null> {
  const days = d.kind === "refund" ? MATCH_WINDOW.refund : MATCH_WINDOW.purchase;
  const from = new Date(d.date);
  from.setDate(from.getDate() - days);
  const to = new Date(d.date);
  to.setDate(to.getDate() + days);
  const candidates = await prisma.transaction.findMany({
    where: { userId, kind: d.kind, amount: d.amount, date: { gte: from, lte: to } },
    select: { id: true, merchant: true, date: true, cardId: true, source: true, amount: true },
    take: 20,
  });
  const gap = (x: Date) => Math.abs(x.getTime() - d.date.getTime());
  const sameStore = (m: string) => merchantsMatch(m, d.merchant);
  const best = candidates
    .filter((c) => !(c.cardId && d.cardId && c.cardId !== d.cardId))
    .filter((c) => sameStore(c.merchant) || c.source === "statement")
    .sort((a, b) => Number(sameStore(b.merchant)) - Number(sameStore(a.merchant)) || gap(a.date) - gap(b.date))[0];
  if (!best) return null;
  const withReceipt = await prisma.transaction.count({ where: { id: best.id, receiptImage: { not: null } } });
  return {
    id: best.id,
    merchant: best.merchant,
    date: dateToInput(best.date),
    amount: best.amount,
    source: best.source,
    hasReceipt: withReceipt > 0,
  };
}

export async function createTransaction(
  input: TransactionInput,
  opts: { allowDuplicate?: boolean } = {},
): Promise<ActionResult> {
  const user = await requireUser();
  const result = await validateTxn(user.id, input);
  if ("error" in result) return fail(result.error ?? "Check the form and try again.");
  if (!opts.allowDuplicate) {
    const duplicate = await findDuplicate(user.id, result.data);
    if (duplicate) return { ok: false, error: "This looks like it's already logged.", duplicate };
  }
  const txn = await prisma.transaction.create({
    data: {
      ...result.data,
      receiptImage: result.receiptImage ?? null,
      source: result.receiptImage ? "receipt" : "manual",
      userId: user.id,
    },
  });
  refresh();
  return { ok: true, id: txn.id };
}

/**
 * Adds a scanned receipt to an entry that's already logged (usually one
 * imported from a bank statement) instead of saving it twice. The amount and
 * date stay as logged; the receipt's store name replaces a bank description,
 * and empty fields get filled in.
 */
export async function mergeReceiptInto(id: string, input: TransactionInput): Promise<ActionResult> {
  const user = await requireUser();
  const existing = await prisma.transaction.findFirst({ where: { id, userId: user.id } });
  if (!existing) return fail("That entry no longer exists.");
  const result = await validateTxn(
    user.id,
    { ...input, kind: existing.kind === "refund" ? "refund" : "purchase", originalId: existing.kind === "refund" ? input.originalId : null },
    id,
  );
  if ("error" in result) return fail(result.error ?? "Check the form and try again.");
  const v = result.data;
  await prisma.transaction.update({
    where: { id },
    data: {
      merchant: existing.source === "statement" ? v.merchant : existing.merchant,
      categoryId: existing.categoryId ?? v.categoryId,
      cardId: existing.cardId ?? v.cardId,
      note: existing.note ?? v.note,
      items: v.items ?? existing.items,
      originalId: existing.originalId ?? v.originalId,
      ...(result.receiptImage ? { receiptImage: result.receiptImage } : {}),
    },
  });
  refresh();
  return { ok: true, id };
}

export async function updateTransaction(id: string, input: TransactionInput): Promise<ActionResult> {
  const user = await requireUser();
  const existing = await prisma.transaction.findFirst({
    where: { id, userId: user.id },
    include: { refunds: { select: { amount: true } } },
  });
  if (!existing) return fail("That expense no longer exists.");
  const result = await validateTxn(user.id, input, id);
  if ("error" in result) return fail(result.error ?? "Check the form and try again.");

  if (existing.kind === "purchase") {
    const refunded = existing.refunds.reduce((s, r) => s + r.amount, 0);
    if (result.data.kind === "refund" && existing.refunds.length > 0) {
      return fail("This purchase has returns recorded against it, so it can't become a refund.");
    }
    if (result.data.amount < refunded) {
      return fail(`This purchase already has $${(refunded / 100).toFixed(2)} in returns. The amount can't be lower than that.`);
    }
  }

  await prisma.transaction.update({
    where: { id },
    data: {
      ...result.data,
      // undefined keeps the stored photo, null removes it.
      ...(result.receiptImage !== undefined ? { receiptImage: result.receiptImage } : {}),
      ...(result.receiptImage && existing.source === "manual" ? { source: "receipt" } : {}),
    },
  });
  refresh();
  return { ok: true, id };
}

/** Deleting a purchase also deletes the returns recorded against it, so they don't linger as money back for nothing. */
export async function deleteTransaction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const [, { count }] = await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { originalId: id, userId: user.id, kind: "refund" } }),
    prisma.transaction.deleteMany({ where: { id, userId: user.id } }),
  ]);
  if (count === 0) return fail("That expense no longer exists.");
  refresh();
  return { ok: true };
}

/**
 * Purchases from the last 120 days that still have money left to return.
 * `includeId` keeps the purchase an existing return is linked to in the list,
 * even when it's older or that return used up what was left.
 */
export async function listReturnablePurchases(includeId?: string | null): Promise<ReturnablePurchase[]> {
  const user = await requireUser();
  const since = new Date();
  since.setDate(since.getDate() - 120);
  const rows = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      kind: "purchase",
      OR: [{ date: { gte: since } }, ...(includeId ? [{ id: includeId }] : [])],
    },
    orderBy: { date: "desc" },
    take: 300,
    select: {
      id: true,
      merchant: true,
      amount: true,
      date: true,
      categoryId: true,
      cardId: true,
      refunds: { select: { amount: true } },
    },
  });
  return rows
    .map((r) => ({
      id: r.id,
      merchant: r.merchant,
      amount: r.amount,
      remaining: r.amount - r.refunds.reduce((s, x) => s + x.amount, 0),
      date: dateToInput(r.date),
      categoryId: r.categoryId,
      cardId: r.cardId,
    }))
    .filter((r) => r.remaining > 0 || r.id === includeId);
}

export async function getReceiptImage(id: string): Promise<string | null> {
  const user = await requireUser();
  const t = await prisma.transaction.findFirst({
    where: { id, userId: user.id },
    select: { receiptImage: true },
  });
  return t?.receiptImage ?? null;
}

// ---------- Bank statement import ----------

const statementRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(200),
  amount: z.number().int().positive().max(100_000_000),
  direction: z.enum(["out", "in"]),
  category: z.string().max(60).optional().nullable(),
  cardLast4: z.string().regex(/^\d{4}$/).optional().nullable(),
});

const prepareSchema = z.object({
  rows: z
    .array(statementRowSchema)
    .min(1, "No transactions were found in that file.")
    .max(3000, "That's more than 3,000 rows. Split the statement into smaller files."),
  cardId: z.string().optional().nullable(),
});

export type PrepareResult = { ok: true; rows: PreparedRow[] } | { ok: false; error: string };

function shiftDays(iso: string, days: number) {
  const d = dateFromInput(iso)!;
  d.setDate(d.getDate() + days);
  return d;
}

/** Checks statement rows against everything already logged and suggests what to import. Changes nothing. */
export async function prepareStatementImport(input: z.input<typeof prepareSchema>): Promise<PrepareResult> {
  const user = await requireUser();
  const parsed = prepareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "The statement couldn't be read." };
  const rows: StatementRow[] = parsed.data.rows;

  const dates = rows.map((r) => r.date).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const hasReturns = rows.some((r) => r.direction === "in");

  const txnSelect = {
    id: true,
    kind: true,
    amount: true,
    merchant: true,
    date: true,
    cardId: true,
    categoryId: true,
    importKey: true,
    source: true,
    refunds: { select: { amount: true } },
  } as const;
  const [cards, categories, nearby, purchases, memory] = await Promise.all([
    prisma.paymentCard.findMany({ where: { userId: user.id, archived: false }, select: { id: true, last4: true } }),
    prisma.category.findMany({ where: { userId: user.id, archived: false }, select: { id: true, name: true } }),
    prisma.transaction.findMany({
      where: { userId: user.id, date: { gte: shiftDays(first, -10), lte: shiftDays(last, 10) } },
      select: txnSelect,
    }),
    hasReturns
      ? prisma.transaction.findMany({
          where: {
            userId: user.id,
            kind: "purchase",
            date: { gte: shiftDays(first, -RETURN_WINDOW_DAYS), lte: shiftDays(last, 1) },
          },
          select: txnSelect,
          orderBy: { date: "desc" },
          take: 3000,
        })
      : Promise.resolve([]),
    // How the person writes store names, and the categories they use for them.
    prisma.transaction.findMany({
      where: { userId: user.id, source: { not: "statement" } },
      distinct: ["merchant"],
      orderBy: { date: "desc" },
      take: 500,
      select: { merchant: true, categoryId: true },
    }),
  ]);

  const cardId = parsed.data.cardId && cards.some((c) => c.id === parsed.data.cardId) ? parsed.data.cardId : null;
  const toExisting = (t: (typeof nearby)[number]): ExistingTxn => ({
    id: t.id,
    kind: t.kind === "refund" ? "refund" : "purchase",
    amount: t.amount,
    merchant: t.merchant,
    date: dateToInput(t.date),
    cardId: t.cardId,
    categoryId: t.categoryId,
    importKey: t.importKey,
    source: t.source,
    refunded: t.refunds.reduce((s, r) => s + r.amount, 0),
  });

  return {
    ok: true,
    rows: prepareRows({
      rows,
      cardId,
      cards,
      categories,
      existing: nearby.map(toExisting),
      purchases: purchases.map(toExisting),
      memory: memory.map((m) => ({ merchant: m.merchant, categoryId: m.categoryId })),
    }),
  };
}

const commitSchema = z.object({
  rows: z
    .array(
      z.object({
        key: z.string().min(1).max(300),
        kind: z.enum(["purchase", "refund"]),
        merchant: z.string().trim().min(1, "Every row needs a store name.").max(120),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        amount: z.number().int().positive().max(100_000_000),
        categoryId: z.string().optional().nullable(),
        cardId: z.string().optional().nullable(),
        link: z.string().max(320).optional().nullable(),
      }),
    )
    .min(1, "Pick at least one row to import.")
    .max(3000),
});

export type CommitResult =
  | { ok: true; purchases: number; refunds: number; alreadyThere: number; unlinked: number }
  | { ok: false; error: string };

/**
 * Saves the rows picked on the review screen. Rows whose fingerprint is
 * already stored are skipped, so a double click or a second tab can't import
 * anything twice. Returns are linked only while the purchase has money left.
 */
export async function commitStatementImport(input: z.input<typeof commitSchema>): Promise<CommitResult> {
  const user = await requireUser();
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the rows and try again." };
  const rows = parsed.data.rows;

  const [categories, cards] = await Promise.all([
    prisma.category.findMany({ where: { userId: user.id }, select: { id: true } }),
    prisma.paymentCard.findMany({ where: { userId: user.id }, select: { id: true } }),
  ]);
  const catIds = new Set(categories.map((c) => c.id));
  const cardIds = new Set(cards.map((c) => c.id));

  const result = await prisma.$transaction(
    async (tx) => {
      const taken = new Set(
        (
          await tx.transaction.findMany({
            where: { userId: user.id, importKey: { in: rows.map((r) => r.key) } },
            select: { importKey: true },
          })
        ).map((t) => t.importKey),
      );
      const fresh = rows.filter((r) => !taken.has(r.key));
      const base = (r: (typeof rows)[number]) => ({
        userId: user.id,
        kind: r.kind,
        amount: r.amount,
        merchant: r.merchant,
        date: dateFromInput(r.date)!,
        categoryId: r.categoryId && catIds.has(r.categoryId) ? r.categoryId : null,
        cardId: r.cardId && cardIds.has(r.cardId) ? r.cardId : null,
        source: "statement",
        importKey: r.key,
      });

      const purchaseRows = fresh.filter((r) => r.kind === "purchase");
      const created = purchaseRows.length
        ? await tx.transaction.createManyAndReturn({
            data: purchaseRows.map(base),
            select: { id: true, importKey: true, amount: true, date: true, categoryId: true, cardId: true },
            skipDuplicates: true,
          })
        : [];

      // Purchases a return can link to: the ones just created, and existing ones named by id.
      type Target = { id: string; left: number; date: Date; categoryId: string | null; cardId: string | null };
      const targets = new Map<string, Target>();
      for (const c of created) {
        targets.set(`row:${c.importKey}`, { id: c.id, left: c.amount, date: c.date, categoryId: c.categoryId, cardId: c.cardId });
      }
      const refundRows = fresh.filter((r) => r.kind === "refund");
      const existingIds = refundRows.flatMap((r) => (r.link?.startsWith("txn:") ? [r.link.slice(4)] : []));
      if (existingIds.length) {
        const found = await tx.transaction.findMany({
          where: { id: { in: existingIds }, userId: user.id, kind: "purchase" },
          select: { id: true, amount: true, date: true, categoryId: true, cardId: true, refunds: { select: { amount: true } } },
        });
        for (const f of found) {
          targets.set(`txn:${f.id}`, {
            id: f.id,
            left: f.amount - f.refunds.reduce((s, r) => s + r.amount, 0),
            date: f.date,
            categoryId: f.categoryId,
            cardId: f.cardId,
          });
        }
      }

      let unlinked = 0;
      const refundData = refundRows.map((r) => {
        const data = { ...base(r), originalId: null as string | null };
        const t = r.link ? targets.get(r.link) : undefined;
        if (t && t.left >= r.amount && dateToInput(t.date) <= r.date) {
          t.left -= r.amount;
          data.originalId = t.id;
          // The return comes off the purchase's category and card.
          data.categoryId = t.categoryId ?? data.categoryId;
          data.cardId = data.cardId ?? t.cardId;
        } else if (r.link) unlinked++;
        return data;
      });
      const refunds = refundData.length
        ? await tx.transaction.createMany({ data: refundData, skipDuplicates: true })
        : { count: 0 };

      return {
        purchases: created.length,
        refunds: refunds.count,
        alreadyThere: rows.length - created.length - refunds.count,
        unlinked,
      };
    },
    { timeout: 30_000 },
  );

  refresh();
  return { ok: true, ...result };
}

// ---------- Categories ----------

const categorySchema = z.object({
  name: z.string().trim().min(1, "Give the category a name.").max(40, "Keep the name under 40 characters."),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  icon: z.string().refine((k) => k in CATEGORY_ICONS, "Pick an icon."),
  budget: z.string().optional(),
});

export type CategoryInput = z.input<typeof categorySchema>;

function parseBudget(raw?: string) {
  if (!raw || !raw.trim()) return { budget: null };
  const cents = parseMoney(raw);
  if (cents === null || cents < 0) return { error: "Enter a budget like 250, or leave it empty." };
  return { budget: cents === 0 ? null : cents };
}

export async function createCategory(input: CategoryInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const b = parseBudget(parsed.data.budget);
  if ("error" in b) return fail(b.error!);
  const clash = await prisma.category.findFirst({ where: { userId: user.id, name: parsed.data.name } });
  if (clash && !clash.archived) return fail(`You already have a category called ${parsed.data.name}.`);
  const cat = clash
    ? await prisma.category.update({
        where: { id: clash.id },
        data: { ...parsed.data, budget: b.budget, archived: false },
      })
    : await prisma.category.create({ data: { ...parsed.data, budget: b.budget, userId: user.id } });
  refresh();
  return { ok: true, id: cat.id };
}

export async function updateCategory(id: string, input: CategoryInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const b = parseBudget(parsed.data.budget);
  if ("error" in b) return fail(b.error!);
  const clash = await prisma.category.findFirst({
    where: { userId: user.id, name: parsed.data.name, NOT: { id } },
  });
  if (clash) return fail(`You already have a category called ${parsed.data.name}.`);
  const { count } = await prisma.category.updateMany({
    where: { id, userId: user.id },
    data: { ...parsed.data, budget: b.budget },
  });
  if (count === 0) return fail("That category no longer exists.");
  refresh();
  return { ok: true, id };
}

/** Archived categories keep their history but stop appearing in pickers. */
export async function archiveCategory(id: string): Promise<ActionResult> {
  const user = await requireUser();
  await prisma.category.updateMany({ where: { id, userId: user.id }, data: { archived: true } });
  refresh();
  return { ok: true };
}

// ---------- Cards ----------

const cardSchema = z.object({
  nickname: z.string().trim().min(1, "Give the card a nickname.").max(40),
  issuer: z.string().trim().max(40).default(""),
  network: z.enum(CARD_NETWORKS),
  last4: z.string().regex(/^\d{4}$/, "Enter the last 4 digits of the card."),
  holderName: z.string().trim().max(60).optional(),
  expiry: z
    .string()
    .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Use MM/YY for the expiry date.")
    .optional()
    .or(z.literal("")),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

export type CardInput = z.input<typeof cardSchema>;

function cardData(v: z.output<typeof cardSchema>) {
  const [mm, yy] = v.expiry ? v.expiry.split("/") : [];
  return {
    nickname: v.nickname,
    issuer: v.issuer,
    network: v.network,
    last4: v.last4,
    holderName: v.holderName || null,
    expMonth: mm ? Number(mm) : null,
    expYear: yy ? 2000 + Number(yy) : null,
    color: v.color,
  };
}

export async function createCard(input: CardInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = cardSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const card = await prisma.paymentCard.create({ data: { ...cardData(parsed.data), userId: user.id } });
  refresh();
  return { ok: true, id: card.id };
}

export async function updateCard(id: string, input: CardInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = cardSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { count } = await prisma.paymentCard.updateMany({
    where: { id, userId: user.id },
    data: cardData(parsed.data),
  });
  if (count === 0) return fail("That card no longer exists.");
  refresh();
  return { ok: true, id };
}

export async function archiveCard(id: string): Promise<ActionResult> {
  const user = await requireUser();
  await prisma.paymentCard.updateMany({ where: { id, userId: user.id }, data: { archived: true } });
  refresh();
  return { ok: true };
}

// ---------- Settings ----------

export async function updateSettings(input: { name: string; monthlyEmails: boolean }): Promise<ActionResult> {
  const user = await requireUser();
  const name = input.name.trim();
  if (!name) return fail("Enter your name.");
  await prisma.user.update({
    where: { id: user.id },
    data: { name: name.slice(0, 60), monthlyEmails: input.monthlyEmails },
  });
  refresh();
  return { ok: true };
}

/** Sends last month's report right away, so people can see what the monthly email looks like. */
export async function sendReportNow(): Promise<ActionResult> {
  const user = await requireUser();
  const now = new Date();
  const lastMonth = shiftMonth(new Date(now.getFullYear(), now.getMonth(), 1), -1);
  try {
    await sendMonthlyReport({ id: user.id, email: user.email, name: user.name }, lastMonth, { force: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "The report couldn't be sent.");
  }
  return { ok: true, id: monthKey(lastMonth) };
}
