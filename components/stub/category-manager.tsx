"use client";

import { Archive, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { archiveCategory, createCategory, updateCategory } from "@/lib/actions";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "@/lib/catalog";
import { centsToInput, money } from "@/lib/format";
import type { CategoryOption } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";
import { ColorSwatches } from "./expense-sheet";

type Row = CategoryOption & { spent: number };

export function CategoryManager({ categories }: { categories: Row[] }) {
  const [editing, setEditing] = useState<Row | "new" | null>(null);

  return (
    <>
      <div className="rounded-2xl border bg-card shadow-raise">
        <ul className="divide-y">
          {categories.map((c) => {
            const used = c.budget ? c.spent / c.budget : null;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setEditing(c)}
                  className="flex w-full cursor-pointer items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset active:bg-muted"
                >
                  <CategoryIcon icon={c.icon} color={c.color} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.budget ? `Budget ${money(c.budget, { round: true })} a month` : "No budget"}
                    </p>
                  </div>
                  <div className="w-28 shrink-0 text-right sm:w-40">
                    <p className="num text-sm font-medium">{money(c.spent)}</p>
                    {used !== null ? (
                      <div className="mt-1.5 ml-auto h-1.5 w-full max-w-32 rounded-r-[4px] bg-muted" aria-hidden>
                        <div
                          className="h-full rounded-r-[4px]"
                          style={{ width: `${Math.min(100, used * 100)}%`, background: used > 1 ? "var(--warn)" : c.color }}
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">this month</p>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="border-t p-3">
          <Button variant="ghost" className="w-full justify-start text-primary hover:text-primary" onClick={() => setEditing("new")}>
            <Plus />
            New category
          </Button>
        </div>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:max-w-md">
          {editing ? (
            <CategoryForm
              key={editing === "new" ? "new" : editing.id}
              category={editing === "new" ? null : editing}
              nextColor={CATEGORY_COLORS[categories.length % (CATEGORY_COLORS.length - 1)]}
              onDone={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CategoryForm({ category, nextColor, onDone }: { category: Row | null; nextColor: string; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "other");
  const [color, setColor] = useState(category?.color ?? nextColor);
  const [budget, setBudget] = useState(category?.budget ? centsToInput(category.budget) : "");
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const input = { name, icon, color, budget };
      const res = category ? await updateCategory(category.id, input) : await createCategory(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(category ? "Category saved" : `Added ${name.trim()}`);
      onDone();
      router.refresh();
    });
  }

  function archive() {
    if (!category) return;
    startTransition(async () => {
      await archiveCategory(category.id);
      toast.success(`${category.name} removed`);
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} noValidate>
      <DialogHeader>
        <DialogTitle className="text-2xl tracking-[-0.02em]">{category ? "Edit category" : "New category"}</DialogTitle>
        <DialogDescription>Budgets are optional. With one set, insights tell you when you&apos;re close.</DialogDescription>
      </DialogHeader>

      <div className="mt-6 flex items-center gap-3">
        <CategoryIcon icon={icon} color={color} className="size-11 rounded-xl [&_svg]:size-5" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="cat-name">Name</Label>
          <Input id="cat-name" placeholder="Climbing gym" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!category} />
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <Label>Icon</Label>
        <div role="radiogroup" aria-label="Icon" className="grid grid-cols-7 gap-1.5">
          {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={icon === key}
              aria-label={key}
              onClick={() => setIcon(key)}
              className={cn(
                "flex aspect-square cursor-pointer items-center justify-center rounded-lg border text-muted-foreground transition-[border-color,background-color,color] duration-150 hover:border-foreground/25 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-95",
                icon === key && "border-primary bg-carbon-wash text-primary",
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <Label>Color</Label>
        <ColorSwatches value={color} onChange={setColor} />
      </div>

      <div className="mt-5 flex flex-col gap-1.5">
        <Label htmlFor="cat-budget">
          Monthly budget <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <div className="relative w-40">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
          <Input id="cat-budget" inputMode="decimal" placeholder="0" className="num pl-6" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex items-center gap-2">
        {category ? (
          confirmArchive ? (
            <div className="mr-auto flex items-center gap-1.5">
              <Button type="button" variant="destructive" size="sm" onClick={archive} disabled={pending}>
                Remove
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmArchive(false)}>
                Keep it
              </Button>
            </div>
          ) : (
            <Button type="button" variant="ghost" className="mr-auto text-muted-foreground" onClick={() => setConfirmArchive(true)}>
              <Archive />
              Remove
            </Button>
          )
        ) : (
          <span className="mr-auto" />
        )}
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {category ? "Save category" : "Add category"}
        </Button>
      </div>
      {category && confirmArchive ? (
        <p className="mt-3 text-xs text-muted-foreground">Past expenses stay in {category.name}. It just won&apos;t be offered for new ones.</p>
      ) : null}
    </form>
  );
}
