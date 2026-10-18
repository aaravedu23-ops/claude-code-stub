import type { Metadata } from "next";
import { CardManager } from "@/components/stub/card-manager";
import { PageBody, PageHeader } from "@/components/stub/page-header";
import { prisma } from "@/lib/db";
import { monthRange } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Cards" };

export default async function CardsPage() {
  const user = await requireUser();
  const { from, to } = monthRange(new Date());
  const [cards, sums] = await Promise.all([
    prisma.paymentCard.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, nickname: true, issuer: true, network: true, last4: true, color: true, holderName: true, expMonth: true, expYear: true },
    }),
    prisma.transaction.groupBy({
      by: ["cardId", "kind"],
      where: { userId: user.id, date: { gte: from, lt: to }, cardId: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  const spend: Record<string, number> = {};
  for (const s of sums) {
    if (!s.cardId) continue;
    spend[s.cardId] = (spend[s.cardId] ?? 0) + (s.kind === "refund" ? -1 : 1) * (s._sum.amount ?? 0);
  }

  return (
    <PageBody>
      <PageHeader
        title="Cards"
        description="Each card you use, filled in once. Tap a card to change it."
      />
      <CardManager cards={cards} spend={spend} />
    </PageBody>
  );
}
