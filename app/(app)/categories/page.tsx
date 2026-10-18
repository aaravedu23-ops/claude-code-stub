import type { Metadata } from "next";
import { CategoryManager } from "@/components/stub/category-manager";
import { PageBody, PageHeader } from "@/components/stub/page-header";
import { prisma } from "@/lib/db";
import { monthRange } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const user = await requireUser();
  const { from, to } = monthRange(new Date());
  const [categories, sums] = await Promise.all([
    prisma.category.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, color: true, icon: true, budget: true },
    }),
    prisma.transaction.groupBy({
      by: ["categoryId", "kind"],
      where: { userId: user.id, date: { gte: from, lt: to } },
      _sum: { amount: true },
    }),
  ]);

  const spent: Record<string, number> = {};
  for (const s of sums) {
    if (!s.categoryId) continue;
    spent[s.categoryId] = (spent[s.categoryId] ?? 0) + (s.kind === "refund" ? -1 : 1) * (s._sum.amount ?? 0);
  }

  return (
    <PageBody className="max-w-3xl">
      <PageHeader title="Categories" description="Rename the defaults, add your own, and set budgets where they help." />
      <CategoryManager categories={categories.map((c) => ({ ...c, spent: spent[c.id] ?? 0 }))} />
    </PageBody>
  );
}
