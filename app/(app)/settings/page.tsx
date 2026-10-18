import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/stub/page-header";
import { SettingsForm } from "@/components/stub/settings-form";
import { prisma } from "@/lib/db";
import { emailEnabled } from "@/lib/email";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [settings, accounts] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true, monthlyEmails: true } }),
    prisma.account.findMany({ where: { userId: user.id }, select: { providerId: true } }),
  ]);

  return (
    <PageBody className="max-w-2xl">
      <PageHeader title="Settings" />
      <SettingsForm
        name={settings?.name ?? ""}
        email={user.email}
        monthlyEmails={settings?.monthlyEmails ?? true}
        signInMethods={accounts.map((a) => (a.providerId === "google" ? "Google" : "Email and password"))}
        emailConfigured={emailEnabled}
      />
    </PageBody>
  );
}
