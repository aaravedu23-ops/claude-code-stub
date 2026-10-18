"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import type { CardOption, CategoryOption } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NativeSelect } from "./expense-sheet";

/** One row of filters above the list. Every change is reflected in the URL. */
export function ExpenseFilters({ categories, cards }: { categories: CategoryOption[]; cards: CardOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, startTransition] = useTransition();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  // Search as you type, after a short pause.
  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => set("q", q.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = ["q", "category", "card", "kind"].some((k) => params.get(k));

  return (
    <div className={cn("mb-6 flex flex-col gap-2 transition-opacity sm:flex-row sm:flex-wrap", pending && "opacity-70")}>
      <div className="relative sm:w-64">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search stores and notes"
          placeholder="Search stores and notes"
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <NativeSelect value={params.get("category") ?? ""} onChange={(v) => set("category", v)} className="sm:w-48">
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value="none">Uncategorized</option>
      </NativeSelect>
      <NativeSelect value={params.get("card") ?? ""} onChange={(v) => set("card", v)} className="sm:w-48">
        <option value="">All cards</option>
        {cards.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nickname} •{c.last4}
          </option>
        ))}
        <option value="none">No card</option>
      </NativeSelect>
      <NativeSelect value={params.get("kind") ?? ""} onChange={(v) => set("kind", v)} className="sm:w-40">
        <option value="">Purchases and returns</option>
        <option value="purchase">Purchases only</option>
        <option value="refund">Returns only</option>
      </NativeSelect>
      {active ? (
        <button
          type="button"
          onClick={() => {
            setQ("");
            const next = new URLSearchParams();
            const month = params.get("month");
            if (month) next.set("month", month);
            startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
          }}
          className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X className="size-4" />
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
