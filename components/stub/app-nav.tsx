"use client";

import { BarChart3, CreditCard, FileUp, LayoutGrid, LogOut, Plus, ReceiptText, Settings, Shapes } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useExpenseSheet } from "./expense-sheet";

const items = [
  { href: "/overview", label: "Overview", icon: LayoutGrid },
  { href: "/expenses", label: "Expenses", icon: ReceiptText },
  { href: "/cards", label: "Cards", icon: CreditCard },
  { href: "/categories", label: "Categories", icon: Shapes },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/import", label: "Import", icon: FileUp },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppNav({ user }: { user: { name: string; email: string; image: string | null } }) {
  const pathname = usePathname();
  const router = useRouter();
  const { open } = useExpenseSheet();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  async function signOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card px-4 py-5 md:flex">
        <Link href="/overview" className="mb-8 rounded-md px-2 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              aria-current={isActive(it.href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-[background-color,color] duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:bg-muted",
                isActive(it.href) ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <it.icon className="size-4" />
              {it.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2.5 border-t px-1 pt-4">
          <Avatar name={user.name} image={user.image} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name || "You"}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            title="Sign out"
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-95"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      {/* Mobile top bar + bottom tabs */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b bg-card/90 px-4 backdrop-blur-md md:hidden">
        <Link href="/overview" aria-label="Stub home">
          <Logo />
        </Link>
        <Link href="/settings" aria-label="Settings" className="rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          <Avatar name={user.name} image={user.image} />
        </Link>
      </div>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-center border-t bg-card/95 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
      >
        {items.slice(0, 2).map((it) => (
          <MobileTab key={it.href} {...it} active={isActive(it.href)} />
        ))}
        <button
          type="button"
          onClick={() => open({ mode: "new" })}
          aria-label="Add expense"
          className="mx-auto -mt-5 flex size-13 cursor-pointer items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-float transition-transform duration-150 ease-(--ease-spring) focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-95"
        >
          <Plus className="size-6" />
        </button>
        {items.slice(2, 5).filter((it) => it.href !== "/categories").map((it) => (
          <MobileTab key={it.href} {...it} active={isActive(it.href)} />
        ))}
      </nav>
    </>
  );
}

function MobileTab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-lg py-1 text-[0.68rem] transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  );
}

function Avatar({ name, image }: { name: string; image: string | null }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" className="size-8 shrink-0 rounded-full border object-cover" />;
  }
  const initials = (name || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-carbon-wash text-xs font-medium text-primary">
      {initials}
    </span>
  );
}
