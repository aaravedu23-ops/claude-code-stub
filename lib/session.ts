import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { DEFAULT_CATEGORIES } from "@/lib/catalog";
import { prisma } from "@/lib/db";

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/** Returns the signed-in user, or sends them to sign in. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user;
}

/** New accounts start with a useful set of categories. */
export async function ensureDefaults(userId: string) {
  const count = await prisma.category.count({ where: { userId } });
  if (count > 0) return;
  await prisma.category.createMany({
    // Staggered timestamps keep the default order when sorting by creation time.
    data: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, userId, createdAt: new Date(Date.now() + i) })),
  });
}
