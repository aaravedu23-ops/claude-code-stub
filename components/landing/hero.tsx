"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { cn } from "@/lib/utils";
import { DashboardPreview } from "./dashboard-preview";

export function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="flex flex-col overflow-x-clip pb-8 md:pb-0">
      <ContainerScroll
        titleComponent={
          <div className="px-4 pb-16 md:pb-24">
            <h1 className="mx-auto max-w-[14ch] text-[3.25rem] leading-[0.98] text-foreground sm:text-7xl md:text-[6.5rem]">
              Every receipt, sorted.
            </h1>
            <p className="mx-auto mt-6 max-w-[52ch] text-base text-muted-foreground md:text-lg">
              Snap a photo of a receipt and Stub fills in the store, date, total and card for you. Returns,
              budgets and a monthly read on your spending come with it.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href={signedIn ? "/overview" : "/sign-in?mode=signup"} className={cn(buttonVariants({ size: "lg" }))}>
                {signedIn ? "Open Stub" : "Start tracking for free"}
              </Link>
              <a href="#how" className={cn(buttonVariants({ size: "lg", variant: "ghost" }))}>
                See how it works
              </a>
            </div>
          </div>
        }
      >
        <DashboardPreview />
      </ContainerScroll>
    </div>
  );
}
