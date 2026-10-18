import { CreditCard, Paperclip, Undo2 } from "lucide-react";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";

export type TxnRowData = {
  id: string;
  kind: string;
  amount: number;
  merchant: string;
  date: Date | string;
  category?: { name: string; color: string; icon: string } | null;
  card?: { nickname: string; last4: string } | null;
  refundedTotal?: number;
  hasReceipt?: boolean;
};

export function TxnRow({ t, className }: { t: TxnRowData; className?: string }) {
  const refund = t.kind === "refund";
  const date = typeof t.date === "string" ? new Date(t.date) : t.date;
  const returned = t.refundedTotal ?? 0;
  return (
    <div className={cn("flex items-center gap-3 py-3", className)}>
      {refund ? (
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-refund-wash text-refund [&_svg]:size-4">
          <Undo2 strokeWidth={2} />
        </span>
      ) : (
        <CategoryIcon icon={t.category?.icon} color={t.category?.color} />
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          <span className="truncate">{t.merchant}</span>
          {t.hasReceipt ? <Paperclip aria-label="Receipt attached" className="size-3 shrink-0 text-muted-foreground" /> : null}
        </p>
        <p className="flex items-center gap-2.5 truncate text-xs text-muted-foreground">
          <span>{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          <span className="truncate">{refund ? "Return" : (t.category?.name ?? "Uncategorized")}</span>
          {t.card ? (
            <span className="inline-flex shrink-0 items-center gap-1">
              <CreditCard aria-hidden className="size-3" />
              <span className="num">{t.card.last4}</span>
            </span>
          ) : null}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={cn("num text-sm font-medium", refund && "text-refund")}>
          {refund ? "+" : ""}
          {money(t.amount)}
        </p>
        {!refund && returned > 0 ? (
          <p className="num text-xs text-refund">
            {returned >= t.amount ? "Returned" : `${money(returned)} returned`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
