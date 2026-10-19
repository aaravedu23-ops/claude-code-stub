import { FileUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ExpenseFilters } from "@/components/stub/expense-filters";
import { AddExpenseButton, ScanReceiptButton } from "@/components/stub/expense-sheet";
import { MonthSwitcher, PageBody, PageHeader, Panel } from "@/components/stub/page-header";
import { TxnList } from "@/components/stub/txn-list";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { dayLabel, money, monthLabel, parseMonthKey } from "@/lib/format";
import { listMonthTxns, type ListedTxn } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Expenses" };

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  const user = await requireUser();
  const sp = await searchParams;
  const month = parseMonthKey(str(sp.month));
  const filters = { q: str(sp.q), categoryId: str(sp.category), cardId: str(sp.card), kind: str(sp.kind) };

  const [txns, categories, cards] = await Promise.all([
    listMonthTxns(user.id, month, filters),
    prisma.category.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, color: true, icon: true, budget: true },
    }),
    prisma.paymentCard.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, nickname: true, issuer: true, network: true, last4: true, color: true, holderName: true, expMonth: true, expYear: true },
    }),
  ]);

  const spent = txns.filter((t) => t.edit.kind === "purchase").reduce((s, t) => s + t.edit.amount, 0);
  const back = txns.filter((t) => t.edit.kind === "refund").reduce((s, t) => s + t.edit.amount, 0);

  const days = new Map<string, ListedTxn[]>();
  for (const t of txns) {
    const key = t.edit.date;
    days.set(key, [...(days.get(key) ?? []), t]);
  }

  return (
    <PageBody>
      <PageHeader
        title="Expenses"
        description={
          txns.length
            ? `${txns.length} ${txns.length === 1 ? "entry" : "entries"} in ${monthLabel(month)}: ${money(spent)} spent${back ? `, ${money(back)} back` : ""}.`
            : undefined
        }
        actions={
          <>
            <Link href="/import" className={buttonVariants({ variant: "outline", className: "bg-card" })}>
              <FileUp />
              Import statement
            </Link>
            <ScanReceiptButton />
            <AddExpenseButton />
          </>
        }
      >
        <MonthSwitcher
          month={month}
          basePath="/expenses"
          params={{ q: filters.q, category: filters.categoryId, card: filters.cardId, kind: filters.kind }}
        />
      </PageHeader>

      <Suspense>
        <ExpenseFilters categories={categories} cards={cards} />
      </Suspense>

      {txns.length === 0 ? (
        <Panel>
          <div className="py-10 text-center">
            <p className="font-medium">
              {Object.values(filters).some(Boolean) ? "Nothing matches these filters." : `No expenses in ${monthLabel(month)} yet.`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {Object.values(filters).some(Boolean)
                ? "Try another month or clear the filters."
                : "Scan a receipt, add one by hand, or import a bank statement and it will show up here."}
            </p>
          </div>
        </Panel>
      ) : (
        <div className="flex flex-col gap-6">
          {[...days.entries()].map(([day, list]) => {
            const net = list.reduce((s, t) => s + (t.edit.kind === "refund" ? -t.edit.amount : t.edit.amount), 0);
            return (
              <section key={day} aria-labelledby={`day-${day}`}>
                <div className="mb-1 flex items-baseline justify-between px-1">
                  <h2 id={`day-${day}`} className="font-sans text-sm font-medium tracking-normal text-muted-foreground">
                    {dayLabel(new Date(`${day}T12:00`))}
                  </h2>
                  <span className="num text-sm text-muted-foreground">{money(net)}</span>
                </div>
                <div className="rounded-2xl border bg-card px-4 shadow-raise md:px-5">
                  <TxnList txns={list} />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </PageBody>
  );
}
