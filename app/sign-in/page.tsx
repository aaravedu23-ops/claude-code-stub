import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { googleEnabled, MIN_PASSWORD_LENGTH } from "@/lib/auth";
import { emailEnabled } from "@/lib/email";
import { getSession } from "@/lib/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await getSession()) redirect("/overview");
  const { mode } = await searchParams;

  return (
    <div className="paper-grain flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-5">
        <Link href="/" className="rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pt-[8vh] pb-16">
        <div className="w-full max-w-sm">
          <SignInForm
            initialMode={mode === "signup" ? "sign-up" : "sign-in"}
            googleEnabled={googleEnabled}
            emailConfigured={emailEnabled}
            minPasswordLength={MIN_PASSWORD_LENGTH}
          />
        </div>
      </main>
    </div>
  );
}
