import { createElement } from "react";
import { categoryIcon } from "@/lib/catalog";
import { cn } from "@/lib/utils";

/** A category's icon on a soft wash of its color. Identity never rides on color alone. */
export function CategoryIcon({
  icon,
  color,
  className,
  size = "md",
}: {
  icon: string | null | undefined;
  color: string | null | undefined;
  className?: string;
  size?: "sm" | "md";
}) {
  const c = color ?? "#7C8290";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[9px]",
        size === "sm" ? "size-6 [&_svg]:size-3.5" : "size-8 [&_svg]:size-4",
        className,
      )}
      style={{ background: `color-mix(in oklab, ${c} 14%, white)`, color: `color-mix(in oklab, ${c} 80%, #172033)` }}
    >
      {createElement(categoryIcon(icon), { strokeWidth: 2 })}
    </span>
  );
}
