import { prisma } from "@/lib/db";
import { monthKey, shiftMonth } from "@/lib/format";
import { sendMonthlyReport } from "@/lib/report";

/**
 * Sends everyone who opted in their report for the month that just ended.
 * Call it on the 1st of each month with `Authorization: Bearer $CRON_SECRET`
 * (vercel.json schedules this on Vercel). Safe to re-run: each user gets each
 * month once.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const month = shiftMonth(new Date(now.getFullYear(), now.getMonth(), 1), -1);
  const users = await prisma.user.findMany({
    where: { monthlyEmails: true },
    select: { id: true, email: true, name: true },
  });

  let sent = 0;
  let skipped = 0;
  const failed: string[] = [];
  for (const user of users) {
    try {
      const r = await sendMonthlyReport(user, month);
      if (r.skipped) skipped++;
      else sent++;
    } catch (e) {
      failed.push(user.id);
      console.error(`Monthly report for ${user.id} failed`, e);
    }
  }

  return Response.json({ month: monthKey(month), sent, skipped, failed });
}
