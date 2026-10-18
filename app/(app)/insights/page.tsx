import { CircleAlert, CircleCheck, Lightbulb, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CategoryBars } from "@/components/stub/category-bars";
import { MonthSwitcher, PageBody, PageHeader, Panel } from "@/components/stub/page-header";
import { TrendChart, type TrendPoint } from "@/components/stub/trend-chart";
import { prisma } from "@/lib/db";
import { money, monthKey, monthLabel, monthRange, parseMonthKey, shiftMonth } from "@/lib/format";
import { getMonthInsights, type Insight } from "@/lib/insights";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Insights" };

const tones: Record<Insight["tone"], { icon: typeof Lightbulb; label: string; className: string }> = {
  good: { icon: CircleCheck, label: "Good news", className: "bg-refund-wash text-refund" },
  watch: { icon: CircleAlert, label: "Worth a look", className: "bg-warn-wash text-warn" },
  neutral: { icon: Lightbulb, label: "Pattern", className: "bg-muted text-muted-foreground" },
};

export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  const user = await requireUser();
  const { month: m } = await searchParams;
  const month = parseMonthKey(typeof m === "string" ? m : null);

  const trendStart = shiftMonth(month, -5);
  const [{ summary, insights, isCurrent }, trendTxns, settings] = await Promise.all([
    getMonthInsights(user.id, month),
    prisma.transaction.findMany({
      where: { userId: user.id, date: { gte: trendStart, lt: monthRange(month).to } },
      select: { kind: true, amount: true, date: true },
    }),
    prisma.user.findUnique({ where: { id: user.id }, select: { monthlyEmails: true } }),
  ]);

  const points: TrendPoint[] = Array.from({ length: 6 }, (_, i) => {
    const d = shiftMonth(trendStart, i);
    return { key: monthKey(d), label: monthLabel(d, { short: true }), net: 0, spent: 0, refunded: 0, current: i === 5 };
  });
  for (const t of trendTxns) {
    const p = points.find((x) => x.key === monthKey(t.date));
    if (!p) continue;
    if (t.kind === "refund") p.refunded += t.amount;
    else p.spent += t.amount;
    p.net = p.spent - p.refunded;
  }

  const next = shiftMonth(month, 1);
  const empty = summary.purchaseCount === 0 && summary.refundCount === 0;

  return (
    <PageBody>
      <PageHeader
        title={`${monthLabel(month).split(" ")[0]}, in short`}
        description={isCurrent ? "This month so far. The full picture arrives by email when it ends." : undefined}
      >
        <MonthSwitcher month={month} basePath="/insights" />
      </PageHeader>

      {empty ? (
        <Panel>
          <div className="py-10 text-center">
            <p className="font-medium">No expenses in {monthLabel(month)}.</p>
            <p className="mt-1 text-sm text-muted-foreground">Insights show up once there&apos;s something to look at.</p>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-6">
            <Panel>
              <dl className="grid grid-cols-3 gap-4">
                <Stat label="Net spend" value={money(summary.net)} big />
                <Stat label="Spent" value={money(summary.spent)} sub={`${summary.purchaseCount} purchases`} />
                <Stat
                  label="Back from returns"
                  value={money(summary.refunded)}
                  sub={`${summary.refundCount} ${summary.refundCount === 1 ? "return" : "returns"}`}
                  positive={summary.refunded > 0}
                />
              </dl>
            </Panel>

            <Panel title="What stood out">
              <ul className="flex flex-col gap-4">
                {insights.map((i) => {
                  const t = tones[i.tone];
                  return (
                    <li key={i.id} className="flex gap-3">
                      <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg", t.className)}>
                        <t.icon className="size-4" aria-hidden />
                      </span>
                      <div>
                        <p className="sr-only">{t.label}:</p>
                        <p className="leading-snug">{i.headline}</p>
                        {i.detail ? <p className="num mt-0.5 text-sm text-muted-foreground">{i.detail}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>

          <div className="flex flex-col gap-6">
            <Panel title="Net spending, last 6 months">
              <TrendChart points={points} />
            </Panel>
            <Panel title="By category">
              <CategoryBars rows={summary.byCategory} total={summary.net} />
            </Panel>
          </div>
        </div>
      )}

      <div className="mt-6 flex items-start gap-3 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Mail className="mt-0.5 size-4 shrink-0" />
        {settings?.monthlyEmails ? (
          <p>
            {isCurrent
              ? `Your ${monthLabel(month).split(" ")[0]} report goes to ${user.email} on ${next.toLocaleDateString("en-US", { month: "long", day: "numeric" })}.`
              : `Monthly reports go to ${user.email} on the 1st.`}{" "}
            <Link href="/settings" className="text-foreground underline-offset-4 hover:underline">
              Email settings
            </Link>
          </p>
        ) : (
          <p>
            Monthly emails are off.{" "}
            <Link href="/settings" className="text-foreground underline-offset-4 hover:underline">
              Turn them on in settings
            </Link>
          </p>
        )}
      </div>
    </PageBody>
  );
}

function Stat({ label, value, sub, big, positive }: { label: string; value: string; sub?: string; big?: boolean; positive?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground sm:text-sm">{label}</dt>
      <dd className={cn("num mt-1 truncate", big ? "font-heading text-2xl tracking-[-0.02em] sm:text-4xl" : "text-lg font-medium sm:text-xl", positive && "text-refund")}>
        {value}
      </dd>
      {sub ? <dd className="text-xs text-muted-foreground">{sub}</dd> : null}
    </div>
  );
}
