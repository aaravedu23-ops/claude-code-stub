/**
 * Fills an account with four months of realistic sample expenses so every
 * screen has something to show.
 *   npm run db:seed-demo -- you@example.com [password]
 * The account is created if it doesn't exist. The password (default
 * "stub-demo-123") is set so you can sign in with it. Running it again
 * replaces that account's cards and expenses.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { DEFAULT_CATEGORIES } from "../lib/catalog";
import { pooledDatabaseUrl } from "../lib/database-url";

const email = process.argv[2];
const password = process.argv[3] ?? "stub-demo-123";
if (!email) {
  console.error("Usage: npm run db:seed-demo -- you@example.com [password]");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: pooledDatabaseUrl() }),
});

// Deterministic pseudo-random so reruns look the same.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const between = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));

async function main() {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { id: randomUUID(), email, name: "Sam Rivera", emailVerified: true },
    });
  }
  const userId = user.id;

  // Email-and-password sign-in lives on a "credential" account row.
  const hashed = await hashPassword(password);
  const credential = await prisma.account.findFirst({ where: { userId, providerId: "credential" } });
  if (credential) await prisma.account.update({ where: { id: credential.id }, data: { password: hashed } });
  else
    await prisma.account.create({
      data: { id: randomUUID(), accountId: userId, providerId: "credential", userId, password: hashed },
    });

  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.paymentCard.deleteMany({ where: { userId } });
  if ((await prisma.category.count({ where: { userId } })) === 0) {
    await prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, userId, createdAt: new Date(Date.now() + i) })),
    });
  }
  const cats = Object.fromEntries(
    (await prisma.category.findMany({ where: { userId } })).map((c) => [c.name, c.id]),
  );
  await prisma.category.update({ where: { id: cats["Dining"] }, data: { budget: 30000 } });
  await prisma.category.update({ where: { id: cats["Groceries"] }, data: { budget: 55000 } });
  await prisma.category.update({ where: { id: cats["Transport"] }, data: { budget: 20000 } });

  const everyday = await prisma.paymentCard.create({
    data: { userId, nickname: "Everyday", issuer: "Harbor Credit Union", network: "Mastercard", last4: "4417", color: "#2F45C5", holderName: user.name, expMonth: 8, expYear: 2029 },
  });
  const travel = await prisma.paymentCard.create({
    data: { userId, nickname: "Travel rewards", issuer: "Northline Bank", network: "Visa", last4: "0921", color: "#172033", expMonth: 3, expYear: 2028 },
  });
  const debit = await prisma.paymentCard.create({
    data: { userId, nickname: "Debit", issuer: "Harbor Credit Union", network: "Debit", last4: "7730", color: "#0F7A58" },
  });

  const plan: { cat: string; merchants: string[]; perMonth: [number, number]; amount: [number, number]; cards: string[] }[] = [
    { cat: "Groceries", merchants: ["Trader Joe's", "Whole Foods", "Safeway"], perMonth: [7, 10], amount: [1800, 9500], cards: [everyday.id, debit.id] },
    { cat: "Dining", merchants: ["Tacos El Gordo", "Blue Bottle Coffee", "Sweetgreen", "Pho Saigon", "Blue Bottle Coffee"], perMonth: [8, 13], amount: [450, 6800], cards: [travel.id, everyday.id] },
    { cat: "Transport", merchants: ["Shell", "Lyft", "Clipper"], perMonth: [4, 7], amount: [900, 5200], cards: [debit.id, everyday.id] },
    { cat: "Shopping", merchants: ["Uniqlo", "Target", "Amazon", "REI"], perMonth: [2, 4], amount: [1500, 14000], cards: [everyday.id, travel.id] },
    { cat: "Bills & utilities", merchants: ["PG&E", "Comcast", "T-Mobile"], perMonth: [3, 3], amount: [4500, 11000], cards: [debit.id] },
    { cat: "Entertainment", merchants: ["AMC", "Spotify", "Steam"], perMonth: [1, 3], amount: [999, 3200], cards: [travel.id] },
    { cat: "Health", merchants: ["Walgreens", "CVS"], perMonth: [0, 2], amount: [800, 4200], cards: [everyday.id] },
  ];

  const now = new Date();
  for (let back = 3; back >= 0; back--) {
    const year = now.getFullYear();
    const month = now.getMonth() - back;
    const lastDay = back === 0 ? now.getDate() : new Date(year, month + 1, 0).getDate();
    for (const p of plan) {
      const n = back === 0 ? Math.round(between(...p.perMonth) * (lastDay / 30)) : between(...p.perMonth);
      for (let i = 0; i < n; i++) {
        const day = between(1, lastDay);
        await prisma.transaction.create({
          data: {
            userId,
            kind: "purchase",
            amount: between(...p.amount) * (p.cat === "Dining" && back === 0 ? 1.3 : 1) | 0,
            merchant: pick(p.merchants),
            date: new Date(year, month, day, 12),
            categoryId: cats[p.cat],
            cardId: pick(p.cards),
          },
        });
      }
    }
  }

  // A purchase with a partial return, and one fully returned.
  const jacket = await prisma.transaction.create({
    data: { userId, kind: "purchase", amount: 12999, merchant: "Uniqlo", date: new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 6), 12), categoryId: cats["Shopping"], cardId: everyday.id, note: "Jacket and two shirts" },
  });
  await prisma.transaction.create({
    data: { userId, kind: "refund", amount: 4800, merchant: "Uniqlo", date: new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 1), 12), categoryId: cats["Shopping"], cardId: everyday.id, originalId: jacket.id, note: "Returned one shirt" },
  });
  const boots = await prisma.transaction.create({
    data: { userId, kind: "purchase", amount: 18995, merchant: "REI", date: new Date(now.getFullYear(), now.getMonth() - 1, 9, 12), categoryId: cats["Shopping"], cardId: travel.id, note: "Hiking boots" },
  });
  await prisma.transaction.create({
    data: { userId, kind: "refund", amount: 18995, merchant: "REI", date: new Date(now.getFullYear(), now.getMonth() - 1, 20, 12), categoryId: cats["Shopping"], cardId: travel.id, originalId: boots.id, note: "Didn't fit" },
  });

  const count = await prisma.transaction.count({ where: { userId } });
  console.log(`Seeded ${count} expenses and 3 cards for ${email}. Sign in with password: ${password}`);
}

main().finally(() => prisma.$disconnect());
