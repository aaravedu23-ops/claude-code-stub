"use client";

import { Camera, Check, ChevronDown, Loader2, Plus, RotateCcw, ScanLine, Trash2, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  createCategory,
  createTransaction,
  deleteTransaction,
  getReceiptImage,
  listReturnablePurchases,
  updateTransaction,
} from "@/lib/actions";
import { CATEGORY_COLORS } from "@/lib/catalog";
import { centsToInput, dateToInput, money } from "@/lib/format";
import { downscaleImage } from "@/lib/image";
import type { ScanResult } from "@/lib/receipt-types";
import type { CardOption, CategoryOption, EditableTxn, ReturnablePurchase } from "@/lib/types";
import { cn } from "@/lib/utils";

// ---------- Context: any page can open the sheet ----------

/** A store you've bought from before, with the category you used last time. */
export type MerchantMemory = { name: string; categoryId: string | null };

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
}

type OpenOptions =
  | { mode: "new"; kind?: "purchase" | "refund"; scan?: boolean }
  | { mode: "edit"; txn: EditableTxn }
  | { mode: "return"; purchase: ReturnablePurchase };

type Ctx = { open: (o: OpenOptions) => void };
const ExpenseSheetContext = createContext<Ctx | null>(null);

export function useExpenseSheet() {
  const ctx = useContext(ExpenseSheetContext);
  if (!ctx) throw new Error("useExpenseSheet must be used inside ExpenseSheetProvider");
  return ctx;
}

export function ExpenseSheetProvider({
  categories,
  cards,
  merchants,
  children,
}: {
  categories: CategoryOption[];
  cards: CardOption[];
  merchants: MerchantMemory[];
  children: React.ReactNode;
}) {
  const [state, setState] = useState<{ open: boolean; opts: OpenOptions; key: number }>({
    open: false,
    opts: { mode: "new" },
    key: 0,
  });
  const open = useCallback((opts: OpenOptions) => setState((s) => ({ open: true, opts, key: s.key + 1 })), []);
  const value = useMemo(() => ({ open }), [open]);

  return (
    <ExpenseSheetContext.Provider value={value}>
      {children}
      <Sheet open={state.open} onOpenChange={(o) => setState((s) => ({ ...s, open: o }))}>
        <SheetContent side="right" className="w-full gap-0 bg-background p-0 sm:max-w-[30rem]">
          <ExpenseForm
            key={state.key}
            opts={state.opts}
            categories={categories}
            cards={cards}
            merchants={merchants}
            onDone={() => setState((s) => ({ ...s, open: false }))}
          />
        </SheetContent>
      </Sheet>
    </ExpenseSheetContext.Provider>
  );
}

export function AddExpenseButton({ className, label = "Add expense" }: { className?: string; label?: string }) {
  const { open } = useExpenseSheet();
  return (
    <Button className={className} onClick={() => open({ mode: "new" })}>
      <Plus />
      {label}
    </Button>
  );
}

export function ScanReceiptButton({ className }: { className?: string }) {
  const { open } = useExpenseSheet();
  return (
    <Button variant="outline" className={cn("bg-card", className)} onClick={() => open({ mode: "new", scan: true })}>
      <Camera />
      Scan receipt
    </Button>
  );
}

// ---------- The form ----------

type Field = "merchant" | "amount" | "date" | "cardId" | "categoryId" | "kind" | "originalId";

type ScanState =
  | { status: "idle" }
  | { status: "reading"; via: "ai" | "ocr" }
  | { status: "done"; filled: Field[]; via: "ai" | "ocr" }
  | { status: "error"; message: string };

function ExpenseForm({
  opts,
  categories: initialCategories,
  cards,
  merchants,
  onDone,
}: {
  opts: OpenOptions;
  categories: CategoryOption[];
  cards: CardOption[];
  merchants: MerchantMemory[];
  onDone: () => void;
}) {
  const router = useRouter();
  const editing = opts.mode === "edit" ? opts.txn : null;
  const fromPurchase = opts.mode === "return" ? opts.purchase : null;

  const [categories, setCategories] = useState(initialCategories);
  const [kind, setKind] = useState<"purchase" | "refund">(
    editing?.kind ?? (fromPurchase ? "refund" : opts.mode === "new" ? (opts.kind ?? "purchase") : "purchase"),
  );
  const [merchant, setMerchant] = useState(editing?.merchant ?? fromPurchase?.merchant ?? "");
  const [amount, setAmount] = useState(
    editing ? centsToInput(editing.amount) : fromPurchase ? centsToInput(fromPurchase.remaining) : "",
  );
  const [date, setDate] = useState(editing?.date ?? dateToInput(new Date()));
  const [cardId, setCardId] = useState<string | null>(
    editing ? editing.cardId : (fromPurchase?.cardId ?? (cards.length === 1 ? cards[0].id : null)),
  );
  const [categoryId, setCategoryId] = useState<string | null>(editing?.categoryId ?? fromPurchase?.categoryId ?? null);
  const [originalId, setOriginalId] = useState<string | null>(editing?.originalId ?? fromPurchase?.id ?? null);
  const [note, setNote] = useState(editing?.note ?? "");
  const [items, setItems] = useState(editing?.items ?? []);

  // undefined = keep what's stored, null = removed, string = new photo
  const [receipt, setReceipt] = useState<string | null | undefined>(editing ? undefined : null);
  const [storedReceipt, setStoredReceipt] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanState>({ status: "idle" });
  const [purchases, setPurchases] = useState<ReturnablePurchase[] | null>(fromPurchase ? [fromPurchase] : null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const isRefund = kind === "refund";
  const shownReceipt = receipt === undefined ? storedReceipt : receipt;

  useEffect(() => {
    if (editing?.hasReceipt) getReceiptImage(editing.id).then(setStoredReceipt);
  }, [editing]);

  useEffect(() => {
    if (isRefund && purchases === null) listReturnablePurchases().then(setPurchases);
  }, [isRefund, purchases]);

  // Opened from "Scan receipt": go straight to the file picker.
  useEffect(() => {
    if (opts.mode === "new" && opts.scan) {
      const t = setTimeout(() => fileRef.current?.click(), 250);
      return () => clearTimeout(t);
    }
  }, [opts]);

  const original = purchases?.find((p) => p.id === originalId) ?? null;
  const maxRefund = original ? original.remaining + (editing?.originalId === original.id ? editing.amount : 0) : null;

  function pickOriginal(id: string | null) {
    setOriginalId(id);
    const p = purchases?.find((x) => x.id === id);
    if (!p) return;
    if (!merchant) setMerchant(p.merchant);
    if (!categoryId) setCategoryId(p.categoryId);
    if (!cardId) setCardId(p.cardId);
    if (!amount) setAmount(centsToInput(p.remaining));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    let dataUrl: string;
    try {
      dataUrl = await downscaleImage(file);
    } catch (e) {
      setScan({ status: "error", message: e instanceof Error ? e.message : "The photo couldn't be opened." });
      return;
    }
    setReceipt(dataUrl);
    setScan({ status: "reading", via: "ai" });

    let result: ScanResult | null = null;
    try {
      const res = await fetch("/api/receipts/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) result = body as ScanResult;
      else if (res.status === 501 && body.fallback === "ocr") {
        setScan({ status: "reading", via: "ocr" });
        const { scanWithOcr } = await import("@/lib/ocr");
        result = await scanWithOcr(dataUrl, cards, categories);
      } else {
        setScan({ status: "error", message: body.error ?? "The receipt couldn't be read. Fill in the details by hand." });
        return;
      }
    } catch {
      setScan({ status: "error", message: "The receipt couldn't be read. Fill in the details by hand." });
      return;
    }
    applyScan(result);
  }

  function applyScan(r: ScanResult) {
    const filled: Field[] = [];
    if (r.kind !== kind) {
      setKind(r.kind);
      filled.push("kind");
    }
    // Prefer how you've written this store before, and remember its category.
    const known = r.merchant ? merchants.find((m) => m.name.toLowerCase() === r.merchant.toLowerCase()) : undefined;
    if (r.merchant) {
      setMerchant(known?.name ?? (r.merchant === r.merchant.toUpperCase() ? titleCase(r.merchant) : r.merchant));
      filled.push("merchant");
    }
    if (r.amount) {
      setAmount(r.amount);
      filled.push("amount");
    }
    if (r.date) {
      setDate(r.date);
      filled.push("date");
    }
    if (r.cardId) {
      setCardId(r.cardId);
      filled.push("cardId");
    }
    const cat = r.categoryId ?? (known?.categoryId && categories.some((c) => c.id === known.categoryId) ? known.categoryId : null);
    if (cat) {
      setCategoryId(cat);
      filled.push("categoryId");
    }
    if (r.items.length) setItems(r.items);

    // A return slip: link it to the most recent matching purchase if there's an obvious one.
    if (r.kind === "refund" && r.merchant) {
      const link = (list: ReturnablePurchase[]) => {
        const cents = r.amount ? Math.round(Number(r.amount) * 100) : 0;
        const match = list.find(
          (p) => p.merchant.toLowerCase() === r.merchant.toLowerCase() && (!cents || p.remaining >= cents),
        );
        if (match) {
          setOriginalId(match.id);
          setCategoryId((c) => c ?? match.categoryId);
          setCardId((c) => c ?? match.cardId);
        }
      };
      if (purchases) link(purchases);
      else
        listReturnablePurchases().then((list) => {
          setPurchases(list);
          link(list);
        });
    }
    setScan({ status: "done", filled, via: r.source });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      kind,
      amount,
      merchant,
      date,
      categoryId,
      cardId,
      originalId: isRefund ? originalId : null,
      note,
      items,
      receiptImage: receipt,
    };
    startTransition(async () => {
      const res = editing ? await updateTransaction(editing.id, input) : await createTransaction(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(editing ? "Changes saved" : isRefund ? "Return saved" : "Expense saved");
      onDone();
      router.refresh();
    });
  }

  function remove() {
    if (!editing) return;
    startTransition(async () => {
      const res = await deleteTransaction(editing.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(editing.kind === "refund" ? "Return deleted" : "Expense deleted");
      onDone();
      router.refresh();
    });
  }

  const filled = scan.status === "done" ? scan.filled : [];
  const title = editing ? (editing.kind === "refund" ? "Edit return" : "Edit expense") : isRefund ? "Record a return" : "Add expense";

  return (
    <form onSubmit={submit} className="flex h-full min-h-0 flex-col" noValidate>
      <SheetHeader className="border-b bg-card px-6 pt-5 pb-4">
        <SheetTitle className="text-2xl tracking-[-0.02em]">{title}</SheetTitle>
        <SheetDescription>
          {isRefund ? "Money you got back for something you returned." : "Scan a receipt or fill in the details."}
        </SheetDescription>
        <div role="radiogroup" aria-label="Type" className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {(["purchase", "refund"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              disabled={editing?.kind === "purchase" && k === "refund" && editing.refundCount > 0}
              onClick={() => setKind(k)}
              className={cn(
                "flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-sm transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
                kind === k ? "bg-card font-medium text-foreground shadow-raise" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k === "refund" ? <Undo2 className="size-3.5" /> : null}
              {k === "purchase" ? "Purchase" : "Return"}
              {filled.includes("kind") && kind === k ? <FromReceipt /> : null}
            </button>
          ))}
        </div>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Receipt */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {shownReceipt ? (
          <div className="flex gap-4 rounded-xl border bg-card p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shownReceipt} alt="Receipt photo" className="h-24 w-20 shrink-0 rounded-md border object-cover object-top" />
            <div className="flex min-w-0 flex-1 flex-col justify-between">
              <ScanStatus scan={scan} />
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={scan.status === "reading"}>
                  <RotateCcw />
                  Scan another
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReceipt(null);
                    setStoredReceipt(null);
                    setScan({ status: "idle" });
                  }}
                  disabled={scan.status === "reading"}
                >
                  <X />
                  Remove photo
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group flex w-full cursor-pointer items-center gap-4 rounded-xl border border-dashed border-input bg-card p-4 text-left transition-[border-color,background-color] duration-150 hover:border-primary/50 hover:bg-carbon-wash/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.99]"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-carbon-wash text-primary transition-transform duration-200 ease-(--ease-spring) group-hover:scale-105">
              <ScanLine className="size-5" />
            </span>
            <span>
              <span className="block font-medium">Scan a receipt</span>
              <span className="block text-sm text-muted-foreground">
                Take a photo or upload one and the details below fill in.
              </span>
            </span>
          </button>
        )}
        {scan.status === "error" ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {scan.message}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-5">
          <FieldRow label="Store" htmlFor="merchant" filled={filled.includes("merchant")}>
            <Input
              id="merchant"
              list="merchant-list"
              autoComplete="off"
              placeholder="Where did you buy it?"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              onBlur={() => {
                if (categoryId) return;
                const known = merchants.find((m) => m.name.toLowerCase() === merchant.trim().toLowerCase());
                if (known?.categoryId && categories.some((c) => c.id === known.categoryId)) setCategoryId(known.categoryId);
              }}
            />
            <datalist id="merchant-list">
              {merchants.map((m) => (
                <option key={m.name} value={m.name} />
              ))}
            </datalist>
          </FieldRow>

          <div className="grid grid-cols-2 gap-4">
            <FieldRow label={isRefund ? "Amount back" : "Amount"} htmlFor="amount" filled={filled.includes("amount")}>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="num pl-6"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </FieldRow>
            <FieldRow label="Date" htmlFor="date" filled={filled.includes("date")}>
              <Input id="date" type="date" value={date} max={dateToInput(new Date())} onChange={(e) => setDate(e.target.value)} />
            </FieldRow>
          </div>

          {isRefund ? (
            <FieldRow label="Returned from" htmlFor="original" hint={original && maxRefund !== null ? `Up to ${money(maxRefund)} can come back on this purchase.` : "Link the original purchase so it shows what came back."}>
              <NativeSelect
                id="original"
                value={originalId ?? ""}
                onChange={(v) => pickOriginal(v || null)}
                disabled={purchases === null}
              >
                <option value="">{purchases === null ? "Loading purchases…" : "Not linked to a purchase"}</option>
                {purchases?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.merchant} on {new Date(p.date + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}, {money(p.amount)}
                    {p.remaining < p.amount ? ` (${money(p.remaining)} left)` : ""}
                  </option>
                ))}
              </NativeSelect>
            </FieldRow>
          ) : null}

          <FieldRow label="Card" filled={filled.includes("cardId")}>
            <CardPicker cards={cards} value={cardId} onChange={setCardId} />
          </FieldRow>

          <FieldRow label="Category" htmlFor="category" filled={filled.includes("categoryId")}>
            <CategoryPicker
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              onCreated={(c) => {
                setCategories((cs) => [...cs, c]);
                setCategoryId(c.id);
              }}
            />
          </FieldRow>

          <FieldRow label="Note" htmlFor="note" optional>
            <Textarea
              id="note"
              rows={2}
              placeholder={isRefund ? "What did you return?" : "Anything to remember about this?"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </FieldRow>

          {items.length > 0 ? <ItemList items={items} onClear={() => setItems([])} /> : null}
        </div>
      </div>

      <SheetFooter className="border-t bg-card px-6 py-4">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          {editing ? (
            confirmDelete ? (
              <div className="mr-auto flex items-center gap-1.5">
                <Button type="button" variant="destructive" size="sm" onClick={remove} disabled={pending}>
                  Delete for good
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </Button>
              </div>
            ) : (
              <Button type="button" variant="ghost" className="mr-auto text-muted-foreground" onClick={() => setConfirmDelete(true)}>
                <Trash2 />
                Delete
              </Button>
            )
          ) : (
            <span className="mr-auto" />
          )}
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || scan.status === "reading"}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {editing ? "Save changes" : isRefund ? "Save return" : "Save expense"}
          </Button>
        </div>
      </SheetFooter>
    </form>
  );
}

function FromReceipt() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-carbon-wash px-1.5 py-px text-[0.68rem] font-medium text-primary">
      <ScanLine className="size-3" aria-hidden />
      from receipt
    </span>
  );
}

function FieldRow({
  label,
  htmlFor,
  filled,
  optional,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  filled?: boolean;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {optional ? <span className="text-xs text-muted-foreground">Optional</span> : null}
        {filled ? <FromReceipt /> : null}
      </div>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ScanStatus({ scan }: { scan: ScanState }) {
  if (scan.status === "reading") {
    return (
      <p className="flex items-center gap-2 text-sm" aria-live="polite">
        <Loader2 className="size-4 animate-spin text-primary" />
        {scan.via === "ai" ? "Reading your receipt…" : "Reading the receipt on this device…"}
      </p>
    );
  }
  if (scan.status === "done") {
    const n = scan.filled.length;
    return (
      <div aria-live="polite">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Check className="size-4 text-refund" />
          {n > 0 ? `Filled in ${n} ${n === 1 ? "field" : "fields"}` : "Nothing readable found"}
        </p>
        <p className="text-xs text-muted-foreground">
          {n > 0 ? "Check them below before saving." : "Fill in the details by hand."}
        </p>
      </div>
    );
  }
  return <p className="text-sm text-muted-foreground">Receipt attached</p>;
}

export function NativeSelect({
  id,
  value,
  onChange,
  disabled,
  children,
  className,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-input bg-card pr-9 pl-3 text-sm transition-colors outline-none hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function CardPicker({
  cards,
  value,
  onChange,
}: {
  cards: CardOption[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const options = [...cards.map((c) => ({ id: c.id as string | null, card: c })), { id: null, card: null }];
  return (
    <div role="radiogroup" aria-label="Card" className="grid grid-cols-2 gap-2">
      {options.map(({ id, card }) => {
        const selected = value === id;
        return (
          <button
            key={id ?? "none"}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={cn(
              "flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2 text-left text-sm transition-[border-color,box-shadow,background-color] duration-150 hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.98]",
              selected && "border-primary bg-carbon-wash/50 ring-1 ring-primary",
            )}
          >
            {card ? (
              <span aria-hidden className="h-5 w-8 shrink-0 rounded-[4px] shadow-raise" style={{ background: card.color }} />
            ) : (
              <span aria-hidden className="h-5 w-8 shrink-0 rounded-[4px] border border-dashed border-input" />
            )}
            <span className="min-w-0">
              <span className="block truncate font-medium">{card ? card.nickname : "No card"}</span>
              <span className="num block truncate text-xs text-muted-foreground">
                {card ? `•••• ${card.last4}` : "Cash or other"}
              </span>
            </span>
          </button>
        );
      })}
      <Link
        href="/cards"
        className="flex items-center gap-2 rounded-lg border border-dashed border-input px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Plus className="size-4" />
        Add a card
      </Link>
    </div>
  );
}

function CategoryPicker({
  categories,
  value,
  onChange,
  onCreated,
}: {
  categories: CategoryOption[];
  value: string | null;
  onChange: (v: string | null) => void;
  onCreated: (c: CategoryOption) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(CATEGORY_COLORS[categories.length % (CATEGORY_COLORS.length - 1)]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setError(null);
    startTransition(async () => {
      const res = await createCategory({ name, color, icon: "other" });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onCreated({ id: res.id!, name: name.trim(), color, icon: "other", budget: null });
      setCreating(false);
      setName("");
      toast.success(`Added ${name.trim()}`);
    });
  }

  if (creating) {
    return (
      <div className="rounded-lg border bg-card p-3">
        <div className="flex gap-2">
          <Input
            autoFocus
            placeholder="New category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                create();
              }
            }}
          />
          <Button type="button" onClick={create} disabled={pending || !name.trim()}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Add
          </Button>
        </div>
        <ColorSwatches value={color} onChange={setColor} className="mt-3" />
        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Set an icon and budget later in Categories.</span>
          <button type="button" className="cursor-pointer rounded underline-offset-2 hover:text-foreground hover:underline" onClick={() => setCreating(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <NativeSelect
      id="category"
      value={value ?? ""}
      onChange={(v) => {
        if (v === "__new") setCreating(true);
        else onChange(v || null);
      }}
    >
      <option value="">Uncategorized</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value="__new">+ New category…</option>
    </NativeSelect>
  );
}

export function ColorSwatches({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (c: string) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label="Color" className={cn("flex flex-wrap gap-2", className)}>
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn(
            "size-6 cursor-pointer rounded-full ring-offset-2 ring-offset-card transition-transform duration-150 ease-(--ease-spring) hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-95",
            value === c && "ring-2 ring-foreground",
          )}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function ItemList({ items, onClear }: { items: { name: string; amount: number }[]; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between px-3 py-2.5 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span>
          {items.length} {items.length === 1 ? "item" : "items"} on the receipt
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="border-t px-3 py-2">
          <ul className="flex flex-col gap-1 text-sm">
            {items.map((it, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="truncate">{it.name}</span>
                <span className="num shrink-0 text-muted-foreground">{money(it.amount)}</span>
              </li>
            ))}
          </ul>
          <button type="button" onClick={onClear} className="mt-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground hover:underline">
            Don&apos;t keep the item list
          </button>
        </div>
      ) : null}
    </div>
  );
}
