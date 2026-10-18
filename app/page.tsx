import { Camera, Check, Mail, Plus, ScanLine } from "lucide-react";
import Link from "next/link";
import { Hero } from "@/components/landing/hero";
import { Logo } from "@/components/logo";
import { CardFace } from "@/components/stub/card-face";
import { CategoryIcon } from "@/components/stub/category-icon";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const steps = [
  {
    icon: Camera,
    title: "Snap the receipt",
    body: "Take a photo or upload one. Purchases and return slips both work.",
  },
  {
    icon: ScanLine,
    title: "Check what it found",
    body: "Store, date, total, card and category are filled in. Change anything before you save.",
  },
  {
    icon: Check,
    title: "Save it",
    body: "It lands in the right month and category. You can still edit it any time after.",
  },
];

export default async function Home() {
  const session = await getSession();
  const signedIn = Boolean(session);

  return (
    <div className="paper-grain flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-transparent bg-background/80 backdrop-blur-md supports-backdrop-filter:bg-background/65">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <a
              href="#how"
              className="hidden rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:inline-block"
            >
              How it works
            </a>
            <a
              href="#features"
              className="hidden rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:inline-block"
            >
              Features
            </a>
            {signedIn ? (
              <Link href="/overview" className={cn(buttonVariants(), "ml-2")}>
                Open Stub
              </Link>
            ) : (
              <>
                <Link href="/sign-in" className={cn(buttonVariants({ variant: "ghost" }), "ml-1")}>
                  Sign in
                </Link>
                <Link href="/sign-in?mode=signup" className={cn(buttonVariants(), "ml-1")}>
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Hero signedIn={signedIn} />

        {/* How it works: a real three-step sequence, so it's numbered. */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-28 md:pb-36">
          <div className="grid gap-12 md:grid-cols-[1fr_1.05fr] md:items-center md:gap-16">
            <div>
              <h2 className="max-w-[16ch] text-4xl md:text-6xl">From paper to sorted in three steps.</h2>
              <ol className="mt-10 flex flex-col gap-7">
                {steps.map((s, i) => (
                  <li key={s.title} className="flex gap-4">
                    <span className="num flex size-9 shrink-0 items-center justify-center rounded-full border bg-card font-heading text-lg">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-medium">{s.title}</p>
                      <p className="mt-0.5 max-w-[44ch] text-muted-foreground">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <ScannedReceipt />
          </div>
        </section>

        <section id="features" className="scroll-mt-20 border-y bg-card">
          <div className="mx-auto grid max-w-6xl md:grid-cols-2">
            <Feature
              title="Your cards, saved once"
              body="Add each card with a nickname and its last four digits. After that, choosing a card is a single tap. Stub never asks for the full number."
              className="md:border-r"
            >
              <div className="relative mx-auto h-44 w-full max-w-xs">
                <CardFace
                  nickname="Travel rewards"
                  issuer="Northline Bank"
                  network="Visa"
                  last4="0921"
                  color="#172033"
                  size="sm"
                  className="absolute top-0 left-0 w-[72%] -rotate-6"
                />
                <CardFace
                  nickname="Everyday"
                  issuer="Harbor Credit Union"
                  network="Mastercard"
                  last4="4417"
                  color="#2F45C5"
                  size="sm"
                  className="absolute top-8 right-0 w-[72%] rotate-3"
                />
              </div>
            </Feature>

            <Feature
              title="Returns that add back up"
              body="Record a return against the original purchase, or scan the return slip. The money comes off that category and that card, and the purchase shows what came back."
            >
              <div className="mx-auto w-full max-w-xs rounded-xl border bg-background p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Uniqlo</span>
                  <span className="num">$129.99</span>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-lg bg-refund-wash px-3 py-2 text-sm text-refund">
                  <span>Returned 1 item</span>
                  <span className="num font-medium">+$48.00</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm text-muted-foreground">
                  <span>You kept</span>
                  <span className="num text-foreground">$81.99</span>
                </div>
              </div>
            </Feature>

            <Feature
              title="Categories that fit your life"
              body="Start with the usual ones, then add your own with an icon, a color and an optional monthly budget."
              className="border-t md:border-r"
            >
              <div className="mx-auto flex max-w-sm flex-wrap justify-center gap-2">
                {[
                  { n: "Groceries", i: "cart", c: "#1baf7a" },
                  { n: "Dining", i: "utensils", c: "#eb6834" },
                  { n: "Climbing gym", i: "gym", c: "#6250d6" },
                  { n: "Dog", i: "paw", c: "#eda100" },
                  { n: "Night classes", i: "school", c: "#2a78d6" },
                ].map((x) => (
                  <span key={x.n} className="inline-flex items-center gap-2 rounded-full border bg-background py-1 pr-3.5 pl-1 text-sm">
                    <CategoryIcon icon={x.i} color={x.c} size="sm" className="rounded-full" />
                    {x.n}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-input px-3.5 py-1 text-sm text-muted-foreground">
                  <Plus className="size-3.5" />
                  New category
                </span>
              </div>
            </Feature>

            <Feature
              title="A monthly read on your money"
              body="On the first of each month you get an email about the month before: what changed, where budgets slipped, and what you got back."
              className="border-t"
            >
              <div className="mx-auto w-full max-w-sm rounded-xl border bg-background p-5">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="size-3.5" />
                  Your September spending
                </p>
                <p className="mt-3 font-heading text-[1.6rem] leading-snug tracking-[-0.02em]">
                  You spent 18% less on Dining than in August, and got $112 back from two returns.
                </p>
              </div>
            </Feature>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-28 text-center md:py-36">
          <h2 className="mx-auto max-w-[18ch] text-5xl md:text-7xl">Start with the receipt in your pocket.</h2>
          <p className="mx-auto mt-5 max-w-[46ch] text-muted-foreground">
            Sign up with an email and password. It takes about a minute to add a card and your first expense.
          </p>
          <Link href={signedIn ? "/overview" : "/sign-in?mode=signup"} className={cn(buttonVariants({ size: "lg" }), "mt-8")}>
            {signedIn ? "Open Stub" : "Create your account"}
          </Link>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <Logo className="scale-90 origin-left" />
          <p>Stub stores only the last four digits of your cards.</p>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  title,
  body,
  children,
  className,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-10 px-5 py-14 md:px-12 md:py-16", className)}>
      <div className="flex min-h-48 items-center">{children}</div>
      <div>
        <h3 className="text-3xl">{title}</h3>
        <p className="mt-3 max-w-[48ch] text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

/** A receipt with the fields Stub read from it marked, beside the form it fills. */
function ScannedReceipt() {
  const lines = [
    ["Bananas", "1.29"],
    ["Greek yogurt 32oz", "5.49"],
    ["Sourdough loaf", "4.99"],
    ["Coffee beans", "11.99"],
    ["Spinach", "2.79"],
  ];
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="receipt-edge mx-auto w-[78%] -rotate-2 bg-card px-6 pt-6 font-[ui-monospace,monospace] text-[0.78rem] leading-relaxed text-foreground/80 shadow-float">
        <p className="text-center text-sm font-semibold text-foreground">
          <Mark>TRADER JOE&apos;S</Mark>
        </p>
        <p className="mt-1 text-center">Store #552</p>
        <p className="mt-1 text-center">
          <Mark>10/16/2026</Mark> 6:42 PM
        </p>
        <div className="mt-4 flex flex-col gap-0.5">
          {lines.map(([n, p]) => (
            <p key={n} className="flex justify-between">
              <span>{n}</span>
              <span>{p}</span>
            </p>
          ))}
        </div>
        <p className="mt-3 flex justify-between border-t border-dashed border-foreground/25 pt-2 font-semibold text-foreground">
          <span>TOTAL</span>
          <Mark>$26.55</Mark>
        </p>
        <p className="mt-1 flex justify-between">
          <span>MASTERCARD</span>
          <Mark>**** 4417</Mark>
        </p>
      </div>
      <div className="relative -mt-3 ml-auto w-[72%] rotate-1 rounded-xl border bg-card p-4 text-sm shadow-float md:-mr-6">
        <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <ScanLine className="size-3.5 text-primary" />
          Filled in from your receipt
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-muted-foreground">Store</dt>
          <dd className="text-right font-medium">Trader Joe&apos;s</dd>
          <dt className="text-muted-foreground">Date</dt>
          <dd className="num text-right">Oct 16, 2026</dd>
          <dt className="text-muted-foreground">Total</dt>
          <dd className="num text-right font-medium">$26.55</dd>
          <dt className="text-muted-foreground">Card</dt>
          <dd className="num text-right">Everyday •4417</dd>
          <dt className="text-muted-foreground">Category</dt>
          <dd className="text-right">Groceries</dd>
        </dl>
      </div>
    </div>
  );
}

function Mark({ children }: { children: React.ReactNode }) {
  return <span className="rounded-[3px] bg-carbon-wash px-1 text-primary ring-1 ring-primary/25">{children}</span>;
}
