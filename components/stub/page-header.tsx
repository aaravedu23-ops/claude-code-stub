import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { monthKey, monthLabel, shiftMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {children}
        <h1 className="text-4xl md:text-5xl">{title}</h1>
        {description ? <p className="mt-2 max-w-[60ch] text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 py-6 md:px-10 md:py-10", className)}>{children}</div>;
}

/** Previous / next month links that keep the rest of the query string. */
export function MonthSwitcher({
  month,
  basePath,
  params = {},
}: {
  month: Date;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const next = shiftMonth(month, 1);
  const href = (d: Date) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set("month", monthKey(d));
    return `${basePath}?${q.toString()}`;
  };
  const btn =
    "flex size-8 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-95";
  return (
    <div className="mb-2 flex items-center gap-2">
      <Link href={href(shiftMonth(month, -1))} className={btn} aria-label="Previous month">
        <ChevronLeft className="size-4" />
      </Link>
      <span className="min-w-32 text-center text-sm font-medium">{monthLabel(month)}</span>
      {next <= thisMonth ? (
        <Link href={href(next)} className={btn} aria-label="Next month">
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className={cn(btn, "pointer-events-none opacity-40")} aria-hidden>
          <ChevronRight className="size-4" />
        </span>
      )}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5 shadow-raise md:p-6", className)}>
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-sans text-[0.95rem] font-medium tracking-normal">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
