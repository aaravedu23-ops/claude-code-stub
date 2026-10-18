"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";

export type CategoryBarRow = {
  id: string;
  name: string;
  color: string;
  icon: string;
  net: number;
  count: number;
  budget: number | null;
};

/**
 * Horizontal bars, one per category, scaled to the larger of the top spend or
 * the biggest budget so budget ticks always fit. Each row is labeled, so color
 * only reinforces identity.
 */
export function CategoryBars({ rows, total }: { rows: CategoryBarRow[]; total: number }) {
  const [active, setActive] = useState<string | null>(null);
  const shown = rows.filter((r) => r.net > 0);
  const max = Math.max(1, ...shown.map((r) => Math.max(r.net, r.budget ?? 0)));

  if (shown.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">Nothing spent yet this month.</p>;
  }

  return (
    <ul className="flex flex-col gap-3.5">
      {shown.map((r) => {
        const over = r.budget !== null && r.budget > 0 && r.net > r.budget;
        const share = total > 0 ? r.net / total : 0;
        return (
          <li
            key={r.id}
            className="relative"
            onMouseEnter={() => setActive(r.id)}
            onMouseLeave={() => setActive((a) => (a === r.id ? null : a))}
            onFocus={() => setActive(r.id)}
            onBlur={() => setActive(null)}
            tabIndex={0}
            aria-label={`${r.name}: ${money(r.net)}, ${Math.round(share * 100)}% of spending${r.budget ? `, budget ${money(r.budget)}` : ""}`}
          >
            <div className="flex items-center gap-3 rounded-lg outline-none">
              <CategoryIcon icon={r.icon} color={r.color} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{r.name}</span>
                  <span className="num shrink-0 font-medium">
                    {money(r.net)}
                    {r.budget ? (
                      <span className={cn("ml-1 font-normal", over ? "text-warn" : "text-muted-foreground")}>
                        / {money(r.budget, { round: true })}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="relative mt-1.5 h-2 rounded-r-[4px] bg-muted">
                  <div
                    className="absolute inset-y-0 left-0 rounded-r-[4px]"
                    style={{ width: `${(r.net / max) * 100}%`, background: r.color }}
                  />
                  {r.budget ? (
                    <div
                      aria-hidden
                      className="absolute -inset-y-1 w-[2px] rounded-full bg-foreground/70 ring-2 ring-card"
                      style={{ left: `calc(${(r.budget / max) * 100}% - 1px)` }}
                    />
                  ) : null}
                </div>
              </div>
            </div>
            {active === r.id ? (
              <div
                role="tooltip"
                className="pointer-events-none absolute right-0 bottom-full z-10 mb-2 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-float"
              >
                <p className="font-medium">{r.name}</p>
                <p className="num opacity-80">{Math.round(share * 100)}% of spending</p>
                <p className="num opacity-80">
                  {r.count} {r.count === 1 ? "purchase" : "purchases"}
                </p>
                {r.budget ? (
                  <p className="num opacity-80">
                    {over
                      ? `${money(r.net - r.budget)} over budget`
                      : `${money(r.budget - r.net)} left of ${money(r.budget, { round: true })}`}
                  </p>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
