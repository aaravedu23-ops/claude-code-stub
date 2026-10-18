import { BarChart3, CreditCard, LayoutGrid, Plus, ReceiptText, Settings, Shapes, Sparkles } from "lucide-react";
import { Logo } from "@/components/logo";
import { CategoryBars, type CategoryBarRow } from "@/components/stub/category-bars";
import { TxnRow, type TxnRowData } from "@/components/stub/txn-row";
import { money } from "@/lib/format";

const cats: CategoryBarRow[] = [
  { id: "g", name: "Groceries", color: "#1baf7a", icon: "cart", net: 48216, count: 9, budget: 55000 },
  { id: "d", name: "Dining", color: "#eb6834", icon: "utensils", net: 31840, count: 12, budget: 30000 },
  { id: "s", name: "Shopping", color: "#6250d6", icon: "bag", net: 22975, count: 4, budget: null },
  { id: "t", name: "Transport", color: "#2a78d6", icon: "car", net: 14320, count: 7, budget: 20000 },
  { id: "b", name: "Bills & utilities", color: "#eda100", icon: "zap", net: 12890, count: 3, budget: null },
];

const d = (day: number) => new Date(2026, 9, day, 12);

const txns: TxnRowData[] = [
  { id: "1", kind: "refund", amount: 4800, merchant: "Uniqlo", date: d(17), card: { nickname: "Everyday", last4: "4417" } },
  { id: "2", kind: "purchase", amount: 8642, merchant: "Trader Joe's", date: d(16), category: cats[0], card: { nickname: "Everyday", last4: "4417" }, hasReceipt: true },
  { id: "3", kind: "purchase", amount: 2350, merchant: "Tacos El Gordo", date: d(15), category: cats[1], card: { nickname: "Travel", last4: "0921" } },
  { id: "4", kind: "purchase", amount: 12999, merchant: "Uniqlo", date: d(12), category: cats[2], card: { nickname: "Everyday", last4: "4417" }, refundedTotal: 4800, hasReceipt: true },
  { id: "5", kind: "purchase", amount: 1840, merchant: "Shell", date: d(11), category: cats[3], card: { nickname: "Debit", last4: "7730" } },
];

const nav = [
  { icon: LayoutGrid, label: "Overview", active: true },
  { icon: ReceiptText, label: "Expenses" },
  { icon: CreditCard, label: "Cards" },
  { icon: Shapes, label: "Categories" },
  { icon: BarChart3, label: "Insights" },
  { icon: Settings, label: "Settings" },
];

/** A static, sample-data rendering of the real overview screen for the landing page. */
export function DashboardPreview() {
  const total = cats.reduce((s, c) => s + c.net, 0);
  return (
    <div className="flex h-full w-full overflow-hidden text-left" inert>
      <aside className="hidden w-52 shrink-0 flex-col gap-6 border-r bg-card p-5 md:flex">
        <Logo />
        <nav className="flex flex-col gap-0.5 text-sm">
          {nav.map((n) => (
            <span
              key={n.label}
              className={
                n.active
                  ? "flex items-center gap-2.5 rounded-lg bg-accent px-2.5 py-2 font-medium text-foreground"
                  : "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-muted-foreground"
              }
            >
              <n.icon className="size-4" />
              {n.label}
            </span>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 overflow-hidden p-4 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">October 2026</p>
            <p className="num font-heading text-4xl tracking-[-0.03em] md:text-5xl">{money(total - 4800)}</p>
            <p className="num mt-1 text-xs text-muted-foreground md:text-sm">
              {money(total)} spent, <span className="text-refund">{money(4800)} back</span> from returns
            </p>
          </div>
          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-raise">
            <Plus className="size-4" />
            <span className="hidden sm:inline">Add expense</span>
          </span>
        </div>

        <div className="mt-6 flex items-center gap-2.5 rounded-xl border border-carbon-wash bg-carbon-wash/60 px-4 py-3 text-sm">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <span className="truncate">Dining is $18 over its $300 budget with 14 days left.</span>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1.1fr]">
          <section className="rounded-xl border bg-card p-5 shadow-raise">
            <h3 className="mb-4 font-sans text-sm font-medium tracking-normal">Where it went</h3>
            <CategoryBars rows={cats} total={total} />
          </section>
          <section className="hidden rounded-xl border bg-card px-5 pt-4 pb-1 shadow-raise md:block">
            <h3 className="mb-1 font-sans text-sm font-medium tracking-normal">Recent</h3>
            <div className="divide-y">
              {txns.map((t) => (
                <TxnRow key={t.id} t={t} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
