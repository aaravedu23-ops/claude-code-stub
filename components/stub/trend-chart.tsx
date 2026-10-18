"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TrendPoint = { key: string; label: string; net: number; spent: number; refunded: number; current: boolean };

/** Net spend per month as columns. One series, so no legend; the title names it. */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...points.map((p) => p.net));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];

  return (
    <div>
      <div className="relative h-52 pl-12">
        {/* Gridlines */}
        {ticks.map((t) => (
          <div key={t} className="absolute right-0 left-12 border-t border-border" style={{ bottom: `${(t / top) * 100}%` }}>
            <span className="num absolute -top-2.5 -left-12 w-10 text-right text-[0.7rem] text-muted-foreground">
              {money(t, { round: true }).replace(".00", "")}
            </span>
          </div>
        ))}
        <div className="absolute inset-0 left-12 flex items-end justify-around gap-[2px]">
          {points.map((p) => (
            <button
              key={p.key}
              type="button"
              onMouseEnter={() => setActive(p.key)}
              onMouseLeave={() => setActive((a) => (a === p.key ? null : a))}
              onFocus={() => setActive(p.key)}
              onBlur={() => setActive(null)}
              aria-label={`${p.label}: ${money(p.net)} net`}
              className="group relative flex h-full flex-1 cursor-default items-end justify-center focus-visible:outline-none"
            >
              <span
                className={cn(
                  "w-full max-w-6 rounded-t-[4px] transition-opacity duration-150",
                  p.current ? "bg-primary" : "bg-primary/45",
                  active && active !== p.key && "opacity-50",
                  "group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
                )}
                style={{ height: `${Math.max(0, (p.net / top) * 100)}%`, minHeight: p.net > 0 ? 2 : 0 }}
              />
              {active === p.key ? (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute z-10 mb-2 w-max rounded-lg bg-foreground px-3 py-2 text-left text-xs text-background shadow-float"
                  style={{ bottom: `${Math.max(0, (p.net / top) * 100)}%` }}
                >
                  <span className="block font-medium">{p.label}</span>
                  <span className="num block opacity-80">{money(p.net)} net</span>
                  <span className="num block opacity-80">
                    {money(p.spent)} spent, {money(p.refunded)} back
                  </span>
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-around gap-[2px] pl-12 text-xs text-muted-foreground">
        {points.map((p) => (
          <span key={p.key} className={cn("flex-1 text-center", p.current && "font-medium text-foreground")}>
            {p.label.split(" ")[0]}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Net spending by month</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}>
              <th scope="row">{p.label}</th>
              <td>{money(p.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function niceTicks(max: number) {
  const dollars = max / 100;
  const rough = dollars / 3;
  const pow = 10 ** Math.floor(Math.log10(Math.max(1, rough)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? pow * 10;
  const ticks: number[] = [];
  for (let v = 0; v <= dollars + step * 0.001; v += step) ticks.push(Math.round(v * 100));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + Math.round(step * 100));
  return ticks;
}
