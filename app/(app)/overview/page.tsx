import { ArrowDownRight, ArrowUpRight, CreditCard, ScanLine, Shapes, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CardFace } from "@/components/stub/card-face";
import { CategoryBars } from "@/components/stub/category-bars";
import { AddExpenseButton, ScanReceiptButton } from "@/components/stub/expense-sheet";
import { MonthSwitcher, PageBody, PageHeader, Panel } from "@/components/stub/page-header";
import { TxnList } from "@/components/stub/txn-list";
import { prisma } from "@/lib/db";
import { money, monthKey, monthLabel, parseMonthKey, shiftMonth } from "@/lib/format";
import { getMonthInsights } from "@/lib/insights";
import { listMonthTxns } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: PageProps<"/overview">) {
  const user = await requireUser();
  const { month: m } = await searchParams;
  const month = parseMonthKey(typeof m === "string" ? m : null);

  const [{ summary, previous, insights, isCurrent }, recent, cards, totalTxns] = await Promise.all([
    getMonthInsights(user.id, month),
    listMonthTxns(user.id, month, {}, 8),
    prisma.paymentCard.findMany({ where: { userId: user.id, archived: false }, orderBy: { createdAt: "asc" } }),
    prisma.transaction.count({ where: { userId: user.id } }),
  ]);

  const firstName = user.name.split(" ")[0];
  // Mid-month, a partial total against a full month misleads; the pace insight covers it instead.
  const change = !isCurrent && previous.net > 0 ? (summary.net - previous.net) / previous.net : null;
  const lead = insights.find((i) => i.tone === "watch") ?? insights.find((i) => i.id !== "total" && i.id !== "pace");

  if (totalTxns === 0) {
    return (
      <PageBody>
        <PageHeader title={`Welcome${firstName ? `, ${firstName}` : ""}.`} description="Three things get Stub working for you. Do them in any order." />
        <div className="grid gap-4 md:grid-cols-3">
          <StartStep
            icon={<CreditCard className="size-5" />}
            title="Add your cards"
            body="A nickname and the last four digits. You'll pick from them whenever you log something."
            done={cards.length > 0}
            action={
              <Link href="/cards" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                {cards.length > 0 ? `${cards.length} added. Add another` : "Add a card"}
              </Link>
            }
          />
          <StartStep
            icon={<ScanLine className="size-5" />}
            title="Log your first expense"
            body="Scan a receipt and check what Stub reads, or type it in."
            action={<ScanReceiptButton className="w-fit" />}
          />
          <StartStep
            icon={<Shapes className="size-5" />}
            title="Make the categories yours"
            body="Nine are set up already. Rename them, add your own, or give them budgets."
            action={
              <Link href="/categories" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                Review categories
              </Link>
            }
          />
        </div>
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeader
        title={
          <span className="num">
            {money(summary.net)}
          </span>
        }
        description={
          <>
            {money(summary.spent)} spent
            {summary.refunded > 0 ? (
              <>
                , <span className="text-refund">{money(summary.refunded)} back</span> from returns
              </>
            ) : null}
            {change !== null ? (
              <span className={cn("ml-2 inline-flex items-center gap-0.5 text-sm", change > 0 ? "text-warn" : "text-refund")}>
                {change > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {Math.abs(Math.round(change * 100))}% vs {monthLabel(shiftMonth(month, -1), { short: true }).split(" ")[0]}
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            <ScanReceiptButton />
            <AddExpenseButton />
          </>
        }
      >
        <MonthSwitcher month={month} basePath="/overview" />
      </PageHeader>

      {lead ? (
        <Link
          href={`/insights?month=${monthKey(month)}`}
          className="mb-6 flex items-center gap-3 rounded-xl border border-primary/15 bg-carbon-wash/70 px-4 py-3 text-sm transition-colors hover:bg-carbon-wash focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Sparkles className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">{lead.headline}</span>
          <span className="hidden shrink-0 text-primary sm:inline">All insights</span>
        </Link>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <Panel
          title="Where it went"
          action={
            <Link href="/categories" className="text-sm text-muted-foreground hover:text-foreground">
              Categories
            </Link>
          }
        >
          <CategoryBars rows={summary.byCategory} total={summary.net} />
        </Panel>

        <Panel
          title={isCurrent ? "Recent" : `${monthLabel(month).split(" ")[0]} expenses`}
          action={
            <Link href={`/expenses?month=${monthKey(month)}`} className="text-sm text-muted-foreground hover:text-foreground">
              See all
            </Link>
          }
        >
          {recent.length ? (
            <TxnList txns={recent} />
          ) : (
            <p className="py-6 text-sm text-muted-foreground">No expenses in {monthLabel(month)}.</p>
          )}
        </Panel>
      </div>

      <Panel
        title="By card"
        className="mt-6"
        action={
          <Link href="/cards" className="text-sm text-muted-foreground hover:text-foreground">
            Manage cards
          </Link>
        }
      >
        {cards.length ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {cards.map((c) => {
              const net = summary.byCard.find((b) => b.id === c.id)?.net ?? 0;
              return (
                <div key={c.id}>
                  <CardFace nickname={c.nickname} issuer={c.issuer} network={c.network} last4={c.last4} color={c.color} size="sm" />
                  <p className="num mt-2 text-sm font-medium">{money(net)}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            <Link href="/cards" className="text-primary underline-offset-4 hover:underline">
              Add a card
            </Link>{" "}
            to see spending split by card.
          </p>
        )}
      </Panel>
    </PageBody>
  );
}

function StartStep({
  icon,
  title,
  body,
  action,
  done,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
  done?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl border bg-card p-6 shadow-raise", done && "border-refund/30")}>
      <span className={cn("flex size-10 items-center justify-center rounded-xl", done ? "bg-refund-wash text-refund" : "bg-carbon-wash text-primary")}>
        {icon}
      </span>
      <h2 className="text-2xl">{title}</h2>
      <p className="flex-1 text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}
