import { cn } from "@/lib/utils";

/** The Stub mark: a receipt with a torn edge and two printed lines. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 28" aria-hidden className={cn("h-7 w-6", className)}>
      <path
        d="M3 2.5A1.5 1.5 0 0 1 4.5 1h15A1.5 1.5 0 0 1 21 2.5V25l-3-2-3 2-3-2-3 2-3-2-3 2V2.5Z"
        fill="currentColor"
      />
      <path d="M7 8h10M7 12.5h6" stroke="var(--background, #F4F5F7)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="17.5" r="1.6" fill="var(--background, #F4F5F7)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-foreground", className)}>
      <LogoMark className="text-primary" />
      <span className="font-heading text-[1.45rem] leading-none tracking-[-0.03em]">Stub</span>
    </span>
  );
}
