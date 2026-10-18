import { AppNav } from "@/components/stub/app-nav";
import { ExpenseSheetProvider } from "@/components/stub/expense-sheet";
import { prisma } from "@/lib/db";
import { ensureDefaults, requireUser } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  await ensureDefaults(user.id);

  const [categories, cards, merchants] = await Promise.all([
    prisma.category.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, color: true, icon: true, budget: true },
    }),
    prisma.paymentCard.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        nickname: true,
        issuer: true,
        network: true,
        last4: true,
        color: true,
        holderName: true,
        expMonth: true,
        expYear: true,
      },
    }),
    prisma.transaction.findMany({
      where: { userId: user.id },
      distinct: ["merchant"],
      orderBy: { date: "desc" },
      take: 60,
      select: { merchant: true, categoryId: true },
    }),
  ]);

  return (
    <ExpenseSheetProvider categories={categories} cards={cards} merchants={merchants.map((m) => ({ name: m.merchant, categoryId: m.categoryId }))}>
      <div className="flex min-h-full flex-1">
        <AppNav user={{ name: user.name, email: user.email, image: user.image ?? null }} />
        <main className="min-w-0 flex-1 pt-14 pb-24 md:pt-0 md:pb-0">{children}</main>
      </div>
    </ExpenseSheetProvider>
  );
}
