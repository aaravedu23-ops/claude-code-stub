import { cardInk } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export type CardFaceProps = {
  nickname: string;
  issuer?: string | null;
  network: string;
  last4: string;
  holderName?: string | null;
  expiry?: string | null;
  color: string;
  className?: string;
  size?: "sm" | "md";
};

/** A saved card, drawn at real card proportions (85.6 × 54mm). */
export function CardFace({
  nickname,
  issuer,
  network,
  last4,
  holderName,
  expiry,
  color,
  className,
  size = "md",
}: CardFaceProps) {
  const ink = cardInk(color);
  const sm = size === "sm";
  return (
    <div
      className={cn(
        "relative aspect-[1.586] w-full overflow-hidden rounded-[14px] shadow-card select-none",
        sm ? "p-3" : "p-5",
        className,
      )}
      style={{ background: color, color: ink }}
    >
      {/* Soft light from the top-left, like a laminated card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 0% 0%, rgb(255 255 255 / 0.18), transparent 55%), radial-gradient(90% 80% at 110% 120%, rgb(0 0 0 / 0.18), transparent 60%)",
        }}
      />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={cn("truncate font-medium", sm ? "text-[0.8rem]" : "text-[0.95rem]")}>{nickname || "Card nickname"}</p>
            {issuer ? <p className={cn("truncate opacity-70", sm ? "text-[0.65rem]" : "text-xs")}>{issuer}</p> : null}
          </div>
          <span className={cn("shrink-0 font-heading italic opacity-90", sm ? "text-sm" : "text-lg")}>{network}</span>
        </div>
        <div
          aria-hidden
          className={cn("rounded-[5px] border border-current/25", sm ? "h-5 w-7" : "h-7 w-10")}
          style={{ background: "linear-gradient(135deg, rgb(255 255 255 / 0.35), rgb(255 255 255 / 0.08))" }}
        />
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className={cn("num tracking-[0.18em]", sm ? "text-[0.8rem]" : "text-lg")}>
              <span className="opacity-60">•••• </span>
              {last4 || "0000"}
            </p>
            {!sm && holderName ? <p className="truncate text-xs opacity-75">{holderName}</p> : null}
          </div>
          {expiry ? <p className={cn("num shrink-0 opacity-75", sm ? "text-[0.65rem]" : "text-xs")}>{expiry}</p> : null}
        </div>
      </div>
    </div>
  );
}
