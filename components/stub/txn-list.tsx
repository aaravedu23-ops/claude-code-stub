"use client";

import { Undo2 } from "lucide-react";
import type { ListedTxn } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useExpenseSheet } from "./expense-sheet";
import { TxnRow } from "./txn-row";

/** Rows open the edit sheet. Purchases with money left to return get a quick "Record a return" button. */
export function TxnList({ txns, showReturn = true }: { txns: ListedTxn[]; showReturn?: boolean }) {
  const { open } = useExpenseSheet();
  return (
    <ul className="divide-y">
      {txns.map(({ row, edit }) => {
        const remaining = edit.amount - edit.refundedTotal;
        const canReturn = showReturn && edit.kind === "purchase" && remaining > 0;
        return (
          <li key={row.id} className="group relative flex items-center">
            <button
              type="button"
              onClick={() => open({ mode: "edit", txn: edit })}
              className={cn(
                "-mx-2 min-w-0 flex-1 cursor-pointer rounded-lg px-2 text-left transition-colors hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:bg-muted",
                canReturn && "md:pr-12",
              )}
              aria-label={`Edit ${row.merchant}`}
            >
              <TxnRow t={row} />
            </button>
            {canReturn ? (
              <button
                type="button"
                onClick={() =>
                  open({
                    mode: "return",
                    purchase: {
                      id: edit.id,
                      merchant: edit.merchant,
                      amount: edit.amount,
                      remaining,
                      date: edit.date,
                      categoryId: edit.categoryId,
                      cardId: edit.cardId,
                    },
                  })
                }
                title="Record a return"
                aria-label={`Record a return for ${row.merchant}`}
                className="absolute right-0 hidden size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-[opacity,background-color,color] duration-150 group-hover:opacity-100 hover:bg-refund-wash hover:text-refund focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-95 md:flex"
              >
                <Undo2 className="size-4" />
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
