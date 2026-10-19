import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/stub/page-header";
import { StatementImport } from "@/components/stub/statement-import";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Import a statement" };

export default async function ImportPage() {
  const user = await requireUser();
  const [cards, categories] = await Promise.all([
    prisma.paymentCard.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, nickname: true, issuer: true, network: true, last4: true, color: true, holderName: true, expMonth: true, expYear: true },
    }),
    prisma.category.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, color: true, icon: true, budget: true },
    }),
  ]);

  return (
    <PageBody>
      <PageHeader
        title="Import a statement"
        description="Upload a bank or card statement as a PDF, CSV or Excel file. Every row is checked against what you've already logged, so nothing is counted twice."
      />
      <StatementImport cards={cards} categories={categories} />
    </PageBody>
  );
}
