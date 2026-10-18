"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CATEGORY_ICONS, CARD_NETWORKS } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { dateFromInput, dateToInput, monthKey, parseMoney, shiftMonth } from "@/lib/format";
import type { ReturnablePurchase } from "@/lib/types";
import { sendMonthlyReport } from "@/lib/report";
import { requireUser } from "@/lib/session";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

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
  if (v.kind === "refund" && v.originalId) {
    const original = await prisma.transaction.findFirst({
      where: { id: v.originalId, userId, kind: "purchase" },
      include: { refunds: { select: { id: true, amount: true } } },
    });
    if (!original) return { error: "The original purchase couldn't be found." };
    const alreadyBack = original.refunds
      .filter((r) => r.id !== editingId)
      .reduce((s, r) => s + r.amount, 0);
    if (amount > original.amount - alreadyBack) {
      const left = (original.amount - alreadyBack) / 100;
      return { error: `The refund can't be more than the $${left.toFixed(2)} left on that purchase.` };
    }
    originalId = original.id;
  }

  return {
    data: {
      kind: v.kind,
      amount,
      merchant: v.merchant,
      date,
      categoryId: category?.id ?? null,
      cardId: card?.id ?? null,
      originalId,
      note: v.note?.trim() || null,
      items: v.items && v.items.length > 0 ? JSON.stringify(v.items) : null,
    },
    receiptImage: v.receiptImage,
  };
}

export async function createTransaction(input: TransactionInput): Promise<ActionResult> {
  const user = await requireUser();
  const result = await validateTxn(user.id, input);
  if ("error" in result) return fail(result.error ?? "Check the form and try again.");
  const txn = await prisma.transaction.create({
    data: { ...result.data, receiptImage: result.receiptImage ?? null, userId: user.id },
  });
  refresh();
  return { ok: true, id: txn.id };
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
    },
  });
  refresh();
  return { ok: true, id };
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const { count } = await prisma.transaction.deleteMany({ where: { id, userId: user.id } });
  if (count === 0) return fail("That expense no longer exists.");
  refresh();
  return { ok: true };
}

/** Purchases from the last 120 days that still have money left to return. */
export async function listReturnablePurchases(): Promise<ReturnablePurchase[]> {
  const user = await requireUser();
  const since = new Date();
  since.setDate(since.getDate() - 120);
  const rows = await prisma.transaction.findMany({
    where: { userId: user.id, kind: "purchase", date: { gte: since } },
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
    .filter((r) => r.remaining > 0);
}

export async function getReceiptImage(id: string): Promise<string | null> {
  const user = await requireUser();
  const t = await prisma.transaction.findFirst({
    where: { id, userId: user.id },
    select: { receiptImage: true },
  });
  return t?.receiptImage ?? null;
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
