"use client";

import { ArrowRight, Check, ChevronDown, FileSpreadsheet, FileText, Loader2, RotateCcw, Undo2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { commitStatementImport, prepareStatementImport } from "@/lib/actions";
import { money } from "@/lib/format";
import { detectColumns, rowsFromGrid, type ColumnMapping, type StatementRow } from "@/lib/statement";
import type { StatementParseResult } from "@/lib/statement-pdf";
import type { PreparedRow } from "@/lib/statement-match";
import type { CardOption, CategoryOption } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NativeSelect } from "./expense-sheet";

type Grid = unknown[][];
type Filter = "import" | "logged" | "skipped" | "all";
type Stage =
  | { name: "pick" }
  | { name: "reading"; message: string }
  | { name: "review" }
  | { name: "done"; purchases: number; refunds: number; alreadyThere: number; unlinked: number; month: string };

const SPREADSHEET = /\.(csv|tsv|txt|xlsx|xlsm|xls|ods)$/i;
const PAGE = 150;

const SOURCE_LABEL: Record<string, string> = {
  receipt: "from a receipt",
  manual: "added by hand",
  statement: "from a statement",
};

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function StatementImport({ cards, categories }: { cards: CardOption[]; categories: CategoryOption[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ name: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [cardId, setCardId] = useState<string | null>(cards.length === 1 ? cards[0].id : null);
  const [statementRows, setStatementRows] = useState<StatementRow[]>([]);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [unreadable, setUnreadable] = useState(0);
  const [rows, setRows] = useState<PreparedRow[]>([]);
  const [filter, setFilter] = useState<Filter>("import");
  const [shown, setShown] = useState(PAGE);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  async function prepare(list: StatementRow[], card: string | null) {
    setError(null);
    if (list.length === 0) {
      setError("No transactions were found. Check the columns below, or try another export.");
      setRows([]);
      setStage({ name: "review" });
      return;
    }
    setStage({ name: "reading", message: "Checking against what you've already logged…" });
    const res = await prepareStatementImport({ rows: list, cardId: card });
    if (!res.ok) {
      setError(res.error);
      setRows([]);
      setStage({ name: "review" });
      return;
    }
    setRows(res.rows);
    setShown(PAGE);
    setFilter("import");
    setStage({ name: "review" });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setFileName(file.name);
    setGrid(null);
    setMapping(null);
    setUnreadable(0);

    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
      setStage({ name: "reading", message: "Reading your statement… long statements can take a minute." });
      const body = new FormData();
      body.append("file", file);
      let result: StatementParseResult;
      try {
        const res = await fetch("/api/statements/parse", { method: "POST", body });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error ?? "The statement couldn't be read.");
          setStage({ name: "pick" });
          return;
        }
        result = json as StatementParseResult;
      } catch {
        setError("The statement couldn't be uploaded. Check your connection and try again.");
        setStage({ name: "pick" });
        return;
      }
      let card = cardId;
      const printed = result.accountLast4 ? cards.find((c) => c.last4 === result.accountLast4) : undefined;
      if (printed && !cardId) {
        card = printed.id;
        setCardId(printed.id);
      }
      setStatementRows(result.rows);
      await prepare(result.rows, card);
      return;
    }

    if (!SPREADSHEET.test(file.name)) {
      setError("Upload a PDF, CSV or Excel file.");
      return;
    }
    setStage({ name: "reading", message: "Reading your spreadsheet…" });
    let sheets: Grid[];
    try {
      const XLSX = await import("xlsx");
      const isText = /\.(csv|tsv|txt)$/i.test(file.name);
      // Text files stay as text so dates like 03/04 aren't guessed at; Excel dates come through as dates.
      const wb = isText
        ? XLSX.read(await file.text(), { type: "string", raw: true })
        : XLSX.read(await file.arrayBuffer(), { cellDates: true });
      sheets = wb.SheetNames.map((n) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: "" }));
    } catch {
      setError("That file couldn't be opened. Try exporting it again as CSV.");
      setStage({ name: "pick" });
      return;
    }
    // Use the first sheet that looks like a list of transactions.
    let pickedGrid = sheets[0] ?? [];
    let found: ColumnMapping | null = null;
    for (const g of sheets) {
      const m = detectColumns(g);
      if (m) {
        pickedGrid = g;
        found = m;
        break;
      }
    }
    setGrid(pickedGrid);
    const m: ColumnMapping = found ?? {
      headerRow: 0,
      date: 0,
      description: 1,
      amount: 2,
      debit: null,
      credit: null,
      type: null,
      card: null,
      purchasesNegative: true,
      dayFirst: false,
    };
    setMapping(m);
    if (!found) {
      setError("The date and amount columns couldn't be found. Pick them below.");
      setRows([]);
      setStage({ name: "review" });
      return;
    }
    const { rows: list, skipped } = rowsFromGrid(pickedGrid, m);
    setUnreadable(skipped);
    setStatementRows(list);
    await prepare(list, cardId);
  }

  function applyMapping(next: ColumnMapping) {
    setMapping(next);
    if (!grid) return;
    const { rows: list, skipped } = rowsFromGrid(grid, next);
    setUnreadable(skipped);
    setStatementRows(list);
    void prepare(list, cardId);
  }

  function changeCard(id: string | null) {
    setCardId(id);
    // Card affects duplicate checks and fingerprints, so check again.
    if (statementRows.length) void prepare(statementRows, id);
  }

  function update(key: string, patch: Partial<PreparedRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const toImport = rows.filter((r) => r.kind !== "skip");
  const counts = {
    purchases: toImport.filter((r) => r.kind === "purchase").length,
    refunds: toImport.filter((r) => r.kind === "refund").length,
    spent: toImport.filter((r) => r.kind === "purchase").reduce((s, r) => s + r.amount, 0),
    back: toImport.filter((r) => r.kind === "refund").reduce((s, r) => s + r.amount, 0),
    logged: rows.filter((r) => r.match).length,
    skipped: rows.filter((r) => r.kind === "skip" && !r.match).length,
  };

  const visible = useMemo(() => {
    switch (filter) {
      case "import":
        return rows.filter((r) => r.kind !== "skip");
      case "logged":
        return rows.filter((r) => r.match);
      case "skipped":
        return rows.filter((r) => r.kind === "skip" && !r.match);
      default:
        return rows;
    }
  }, [rows, filter]);

  function commit() {
    setError(null);
    const missing = toImport.find((r) => !r.merchant.trim());
    if (missing) {
      setError(`Add a store name for the ${money(missing.amount)} row on ${shortDate(missing.date)}.`);
      return;
    }
    startTransition(async () => {
      const res = await commitStatementImport({
        rows: toImport.map((r) => ({
          key: r.key,
          kind: r.kind === "refund" ? "refund" : "purchase",
          merchant: r.merchant.trim(),
          date: r.date,
          amount: r.amount,
          categoryId: r.categoryId,
          cardId: r.cardId,
          link: r.kind === "refund" ? r.link : null,
        })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const latest = toImport.map((r) => r.date).sort().at(-1) ?? "";
      setStage({ name: "done", ...res, month: latest.slice(0, 7) });
      toast.success(`Imported ${res.purchases + res.refunds} ${res.purchases + res.refunds === 1 ? "entry" : "entries"}`);
      router.refresh();
    });
  }

  function reset() {
    setStage({ name: "pick" });
    setRows([]);
    setStatementRows([]);
    setGrid(null);
    setMapping(null);
    setError(null);
    setFileName("");
  }

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept=".pdf,.csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods,application/pdf,text/csv"
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        void onFile(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );

  // ---------- Done ----------
  if (stage.name === "done") {
    const total = stage.purchases + stage.refunds;
    return (
      <div className="rounded-2xl border bg-card p-6 shadow-raise md:p-8">
        <span className="flex size-11 items-center justify-center rounded-xl bg-refund-wash text-refund">
          <Check className="size-5" />
        </span>
        <h2 className="mt-4 text-2xl tracking-[-0.02em]">
          {total > 0 ? `Imported ${total} ${total === 1 ? "entry" : "entries"}` : "Nothing new to import"}
        </h2>
        <ul className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
          {stage.purchases > 0 ? <li>{stage.purchases} {stage.purchases === 1 ? "purchase" : "purchases"}</li> : null}
          {stage.refunds > 0 ? <li>{stage.refunds} {stage.refunds === 1 ? "return" : "returns"}</li> : null}
          {stage.alreadyThere > 0 ? (
            <li>{stage.alreadyThere} already imported a moment ago, so {stage.alreadyThere === 1 ? "it was" : "they were"} skipped</li>
          ) : null}
          {stage.unlinked > 0 ? (
            <li>
              {stage.unlinked} {stage.unlinked === 1 ? "return was" : "returns were"} saved without a link because the purchase
              had nothing left to return
            </li>
          ) : null}
        </ul>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href={stage.month ? `/expenses?month=${stage.month}` : "/expenses"} className={buttonVariants()}>
            See expenses
            <ArrowRight />
          </Link>
          <Button variant="outline" onClick={reset}>
            Import another statement
          </Button>
        </div>
      </div>
    );
  }

  // ---------- Pick a file ----------
  if (stage.name === "pick" || (stage.name === "reading" && rows.length === 0 && !grid)) {
    const reading = stage.name === "reading";
    return (
      <div className="flex flex-col gap-4">
        {fileInput}
        <CardSelect cards={cards} value={cardId} onChange={setCardId} disabled={reading} />
        <button
          type="button"
          disabled={reading}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void onFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "group flex w-full cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed border-input bg-card px-6 py-12 text-center transition-[border-color,background-color] duration-150 hover:border-primary/50 hover:bg-carbon-wash/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.995] disabled:cursor-progress",
            dragging && "border-primary bg-carbon-wash/50",
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-xl bg-carbon-wash text-primary transition-transform duration-200 ease-(--ease-spring) group-hover:scale-105">
            {reading ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
          </span>
          {reading ? (
            <span aria-live="polite">
              <span className="block font-medium">{fileName}</span>
              <span className="block text-sm text-muted-foreground">{stage.message}</span>
            </span>
          ) : (
            <span>
              <span className="block font-medium">Drop a statement here, or choose a file</span>
              <span className="block text-sm text-muted-foreground">PDF, CSV or Excel (.xlsx, .xls) from your bank or card</span>
            </span>
          )}
        </button>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <Tip icon={FileSpreadsheet} title="CSV or Excel works best">
            Most banks offer a download under Activity or Statements. It&apos;s exact, and nothing gets misread.
          </Tip>
          <Tip icon={FileText} title="PDF statements work too">
            Every transaction is read from the statement. Check the list before importing.
          </Tip>
          <Tip icon={Check} title="Nothing is counted twice">
            Rows that match a receipt, something you added by hand, or an earlier import are skipped.
          </Tip>
        </div>
      </div>
    );
  }

  // ---------- Review ----------
  const reading = stage.name === "reading";
  return (
    <div className="flex flex-col gap-4">
      {fileInput}
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-raise sm:flex-row sm:items-end sm:justify-between md:p-5">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">File</p>
          <p className="flex items-center gap-2 truncate font-medium">
            {grid ? <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
            <span className="truncate">{fileName}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? "transaction" : "transactions"} found
            {unreadable > 0 ? `, ${unreadable} ${unreadable === 1 ? "line" : "lines"} without a date or amount left out` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <CardSelect cards={cards} value={cardId} onChange={changeCard} disabled={reading || pending} compact />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={reading || pending}>
            <RotateCcw />
            Another file
          </Button>
        </div>
      </div>

      {grid && mapping ? (
        <ColumnEditor grid={grid} mapping={mapping} onChange={applyMapping} defaultOpen={rows.length === 0} disabled={reading} />
      ) : null}

      {reading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Loader2 className="size-4 animate-spin text-primary" />
          {stage.message}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="New purchases" value={String(counts.purchases)} sub={money(counts.spent)} />
            <Stat label="New returns" value={String(counts.refunds)} sub={counts.back ? `${money(counts.back)} back` : "None"} tone="refund" />
            <Stat label="Already logged" value={String(counts.logged)} sub="Skipped" />
            <Stat label="Not spending" value={String(counts.skipped)} sub="Payments, transfers" />
          </div>

          <div role="tablist" aria-label="Show" className="flex flex-wrap gap-1 rounded-xl bg-muted p-1 sm:w-fit">
            {(
              [
                ["import", `To import (${toImport.length})`],
                ["logged", `Already logged (${counts.logged})`],
                ["skipped", `Skipped (${counts.skipped})`],
                ["all", `All (${rows.length})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={filter === k}
                onClick={() => {
                  setFilter(k);
                  setShown(PAGE);
                }}
                className={cn(
                  "h-8 cursor-pointer rounded-lg px-3 text-sm transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.98]",
                  filter === k ? "bg-card font-medium text-foreground shadow-raise" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={cn("rounded-2xl border bg-card px-4 shadow-raise md:px-5", reading && "pointer-events-none opacity-60")}>
            {visible.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nothing here.</p>
            ) : (
              <ul className="divide-y">
                {visible.slice(0, shown).map((r) => (
                  <ImportRow key={r.key} row={r} categories={categories} onChange={(patch) => update(r.key, patch)} />
                ))}
              </ul>
            )}
            {visible.length > shown ? (
              <div className="border-t py-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setShown((n) => n + PAGE)}>
                  Show {Math.min(PAGE, visible.length - shown)} more
                </Button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="sticky bottom-20 z-10 flex flex-col gap-2 rounded-2xl border bg-card/95 p-4 shadow-float backdrop-blur-md sm:flex-row sm:items-center sm:justify-between md:bottom-4">
        <div className="text-sm">
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : (
            <p className="text-muted-foreground">
              {toImport.length === 0
                ? "Nothing selected to import."
                : `${counts.purchases} ${counts.purchases === 1 ? "purchase" : "purchases"}${counts.refunds ? ` and ${counts.refunds} ${counts.refunds === 1 ? "return" : "returns"}` : ""} will be added.`}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reset} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={commit} disabled={pending || reading || toImport.length === 0}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Import {toImport.length || ""} {toImport.length === 1 ? "entry" : "entries"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ImportRow({
  row: r,
  categories,
  onChange,
}: {
  row: PreparedRow;
  categories: CategoryOption[];
  onChange: (patch: Partial<PreparedRow>) => void;
}) {
  const refund = r.direction === "in";
  const on = r.kind !== "skip";
  const toggle = () => onChange({ kind: on ? "skip" : refund ? "refund" : "purchase" });

  return (
    <li className={cn("flex gap-3 py-3", !on && "text-muted-foreground")}>
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        aria-label={`${on ? "Don't import" : "Import"} ${r.merchant}, ${money(r.amount)}`}
        onClick={toggle}
        className={cn(
          "mt-2 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-[background-color,border-color] duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-90",
          on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/30",
        )}
      >
        {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-2 md:grid md:grid-cols-[minmax(0,1fr)_12rem_6.5rem] md:items-center md:gap-3">
          <div className="min-w-0">
            <Input
              aria-label="Store"
              value={r.merchant}
              disabled={!on}
              onChange={(e) => onChange({ merchant: e.target.value })}
              className="h-8 border-transparent bg-transparent px-1.5 font-medium hover:border-input focus-visible:bg-card disabled:bg-transparent disabled:opacity-100"
            />
            <p className="truncate px-1.5 text-xs text-muted-foreground" title={r.description}>
              {shortDate(r.date)} · {r.description}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 md:contents">
            <NativeSelect
              value={r.categoryId ?? ""}
              onChange={(v) => onChange({ categoryId: v || null })}
              disabled={!on}
              className="min-w-0 flex-1 md:flex-none"
            >
              <option value="">{refund ? "Same as purchase" : "Uncategorized"}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
            <p className={cn("num shrink-0 text-right text-sm font-medium", refund && on && "text-refund")}>
              {refund ? "+" : ""}
              {money(r.amount)}
            </p>
          </div>
        </div>
        <RowStatus row={r} onChange={onChange} />
      </div>
    </li>
  );
}

function RowStatus({ row: r, onChange }: { row: PreparedRow; onChange: (patch: Partial<PreparedRow>) => void }) {
  const refund = r.direction === "in";
  const parts: React.ReactNode[] = [];

  if (r.match) {
    const m = r.match;
    const what = `${m.merchant} on ${shortDate(m.date)}, ${money(m.amount)}`;
    parts.push(
      <Badge key="match" tone={m.level === "possible" ? "warn" : "muted"}>
        {m.level === "imported"
          ? "Already imported from an earlier statement"
          : m.level === "likely"
            ? `Already logged ${SOURCE_LABEL[m.source] ?? ""}: ${what}`
            : `Might already be logged: ${what}. Tick it if this is a separate ${refund ? "return" : "purchase"}.`}
      </Badge>,
    );
  } else if (r.transfer) {
    parts.push(
      <Badge key="transfer" tone="muted">
        Looks like a card payment, transfer or deposit, not {refund ? "a return" : "spending"}
      </Badge>,
    );
  }

  if (refund && r.kind === "refund") {
    parts.push(
      <div key="link" className="flex min-w-0 items-center gap-2">
        <Undo2 className="size-3.5 shrink-0 text-refund" aria-hidden />
        <label htmlFor={`link-${r.key}`} className="shrink-0 text-xs text-muted-foreground">
          Return of
        </label>
        <NativeSelect id={`link-${r.key}`} value={r.link ?? ""} onChange={(v) => onChange({ link: v || null })} className="min-w-0 flex-1 md:max-w-sm">
          <option value="">{r.linkOptions.length ? "Not linked to a purchase" : "No matching purchase found"}</option>
          {r.linkOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </div>,
    );
  }

  if (!parts.length) return null;
  return <div className="mt-2 flex flex-col gap-2 px-1.5">{parts}</div>;
}

function Badge({ tone, children }: { tone: "muted" | "warn"; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "w-fit max-w-full rounded-md px-2 py-1 text-xs",
        tone === "warn" ? "bg-warn-wash text-warn" : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </p>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "refund" }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-raise">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("num font-heading text-2xl tracking-[-0.02em]", tone === "refund" && Number(value) > 0 && "text-refund")}>{value}</p>
      <p className="num truncate text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Tip({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <Icon className="size-4 text-primary" />
      <p className="mt-2 text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function CardSelect({
  cards,
  value,
  onChange,
  disabled,
  compact,
}: {
  cards: CardOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", compact ? "min-w-48" : "max-w-sm")}>
      <label htmlFor={compact ? "card-compact" : "card"} className="text-xs text-muted-foreground">
        Which card or account is this statement for?
      </label>
      <NativeSelect id={compact ? "card-compact" : "card"} value={value ?? ""} onChange={(v) => onChange(v || null)} disabled={disabled}>
        <option value="">Not one of my saved cards</option>
        {cards.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nickname} •••• {c.last4}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

function ColumnEditor({
  grid,
  mapping,
  onChange,
  defaultOpen,
  disabled,
}: {
  grid: Grid;
  mapping: ColumnMapping;
  onChange: (m: ColumnMapping) => void;
  defaultOpen: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState(mapping);
  const width = Math.max(0, ...grid.slice(0, 30).map((r) => r?.length ?? 0));
  const header = mapping.headerRow >= 0 ? grid[draft.headerRow] ?? [] : [];
  const sample = grid[draft.headerRow + 1] ?? [];
  const columnName = (i: number) => {
    const h = String(header[i] ?? "").trim();
    const s = String(sample[i] ?? "").trim().slice(0, 24);
    return `${h || `Column ${i + 1}`}${s ? ` (e.g. ${s})` : ""}`;
  };
  const split = draft.amount === null;

  const select = (label: string, value: number | null, set: (v: number | null) => void, optional = false) => (
    <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      {label}
      <NativeSelect value={value === null || value < 0 ? "" : String(value)} onChange={(v) => set(v === "" ? null : Number(v))}>
        {optional ? <option value="">None</option> : <option value="">Pick a column</option>}
        {Array.from({ length: width }, (_, i) => (
          <option key={i} value={i}>
            {columnName(i)}
          </option>
        ))}
      </NativeSelect>
    </label>
  );

  return (
    <div className="rounded-2xl border bg-card shadow-raise">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between rounded-2xl px-4 py-3 text-left text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:px-5"
      >
        <span>
          <span className="font-medium">Columns</span>
          <span className="ml-2 text-muted-foreground">
            {split ? "Money out and money in in separate columns" : mapping.purchasesNegative ? "Purchases are negative amounts" : "Purchases are positive amounts"}
          </span>
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="flex flex-col gap-4 border-t px-4 py-4 md:px-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Headings are on row
              <Input
                type="number"
                min={1}
                max={30}
                value={draft.headerRow + 1}
                onChange={(e) => setDraft({ ...draft, headerRow: Math.max(0, Math.min(29, Number(e.target.value) - 1 || 0)) })}
              />
            </label>
            {select("Date", draft.date, (v) => setDraft({ ...draft, date: v ?? -1 }))}
            {select("Description", draft.description, (v) => setDraft({ ...draft, description: v ?? -1 }))}
          </div>
          <div role="radiogroup" aria-label="Amounts" className="grid grid-cols-1 gap-1 rounded-xl bg-muted p-1 sm:w-fit sm:grid-cols-2">
            {[
              [false, "One amount column"],
              [true, "Separate money out / money in"],
            ].map(([isSplit, label]) => (
              <button
                key={String(isSplit)}
                type="button"
                role="radio"
                aria-checked={split === isSplit}
                onClick={() =>
                  setDraft(
                    isSplit
                      ? { ...draft, amount: null, debit: draft.debit ?? draft.amount ?? null, credit: draft.credit }
                      : { ...draft, amount: draft.amount ?? draft.debit ?? 0, debit: null, credit: null },
                  )
                }
                className={cn(
                  "h-8 cursor-pointer rounded-lg px-3 text-sm transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  split === isSplit ? "bg-card font-medium text-foreground shadow-raise" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label as string}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {split ? (
              <>
                {select("Money out (purchases)", draft.debit, (v) => setDraft({ ...draft, debit: v }))}
                {select("Money in (returns, payments)", draft.credit, (v) => setDraft({ ...draft, credit: v }), true)}
              </>
            ) : (
              <>
                {select("Amount", draft.amount, (v) => setDraft({ ...draft, amount: v ?? 0 }))}
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Purchases show as
                  <NativeSelect
                    value={draft.purchasesNegative ? "neg" : "pos"}
                    onChange={(v) => setDraft({ ...draft, purchasesNegative: v === "neg" })}
                  >
                    <option value="neg">Negative numbers (−12.50)</option>
                    <option value="pos">Positive numbers (12.50)</option>
                  </NativeSelect>
                </label>
              </>
            )}
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Dates are written
              <NativeSelect value={draft.dayFirst ? "dmy" : "mdy"} onChange={(v) => setDraft({ ...draft, dayFirst: v === "dmy" })}>
                <option value="mdy">Month first (10/03 = Oct 3)</option>
                <option value="dmy">Day first (03/10 = Oct 3)</option>
              </NativeSelect>
            </label>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => onChange(draft)}
              disabled={disabled || draft.date < 0 || draft.description < 0 || (split ? draft.debit === null && draft.credit === null : draft.amount === null)}
            >
              Use these columns
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
