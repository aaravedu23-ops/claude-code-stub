import "server-only";
import { prisma } from "@/lib/db";
import { emailShell, sendEmail } from "@/lib/email";
import { money, monthKey, monthLabel } from "@/lib/format";
import { getMonthInsights } from "@/lib/insights";

const appUrl = () => process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

type ReportUser = { id: string; email: string; name: string };

/**
 * Emails one user their insights for `month`. Each month is sent once per user
 * unless `force` is set (used by the "send it now" button in settings).
 */
export async function sendMonthlyReport(user: ReportUser, month: Date, opts?: { force?: boolean }) {
  const key = monthKey(month);
  if (!opts?.force) {
    const sent = await prisma.monthlyReport.findUnique({ where: { userId_month: { userId: user.id, month: key } } });
    if (sent) return { skipped: true as const };
  }

  const { summary, insights } = await getMonthInsights(user.id, month, new Date(month.getFullYear(), month.getMonth() + 1, 2));
  const label = monthLabel(month);
  const firstName = escapeHtml(user.name.split(" ")[0] || "there");
  const url = `${appUrl()}/insights?month=${key}`;

  let html: string;
  let text: string;

  if (summary.purchaseCount === 0 && summary.refundCount === 0) {
    text = `Hi ${user.name.split(" ")[0]},\n\nYou didn't log any expenses in ${label}. Add a few this month and next month's report will show where your money went.\n\n${appUrl()}/overview`;
    html = emailShell(
      `<p style="margin:0 0 16px">Hi ${firstName},</p>
<p style="margin:0 0 20px">You didn't log any expenses in ${label}. Add a few this month and next month's report will show where your money went.</p>
<p style="margin:0"><a href="${appUrl()}/overview" style="color:#2F45C5;font-weight:600">Open Stub</a></p>`,
    );
  } else {
    const cats = summary.byCategory.filter((c) => c.net > 0).slice(0, 5);
    const rows = cats
      .map(
        (c) => `<tr><td style="padding:6px 0"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${c.color};margin-right:8px"></span>${escapeHtml(c.name)}</td><td align="right" style="padding:6px 0;font-variant-numeric:tabular-nums">${money(c.net)}</td></tr>`,
      )
      .join("");
    const list = insights
      .map(
        (i) =>
          `<li style="margin:0 0 10px">${escapeHtml(i.headline)}${i.detail ? `<br><span style="color:#5E6675;font-size:13px">${escapeHtml(i.detail)}</span>` : ""}</li>`,
      )
      .join("");

    text = [
      `Hi ${user.name.split(" ")[0]}, here's your ${label} on Stub.`,
      ``,
      `Spent: ${money(summary.spent)}`,
      `Refunds: ${money(summary.refunded)}`,
      `Net: ${money(summary.net)}`,
      ``,
      ...insights.map((i) => `• ${i.headline}${i.detail ? ` (${i.detail})` : ""}`),
      ``,
      `See the details: ${url}`,
    ].join("\n");

    html = emailShell(
      `<p style="margin:0 0 4px;color:#5E6675">Your ${label}</p>
<p style="margin:0 0 4px;font-family:Georgia,serif;font-size:40px;letter-spacing:-0.03em;line-height:1.1">${money(summary.net)}</p>
<p style="margin:0 0 24px;color:#5E6675;font-size:13px">${money(summary.spent)} spent · ${money(summary.refunded)} back from returns</p>
<p style="margin:0 0 12px">Hi ${firstName}, here's what stood out:</p>
<ul style="margin:0 0 24px;padding-left:18px">${list}</ul>
${cats.length ? `<table role="presentation" width="100%" style="border-top:1px solid #E1E4EA;margin:0 0 24px;font-size:14px">${rows}</table>` : ""}
<p style="margin:0"><a href="${url}" style="display:inline-block;background:#2F45C5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">See ${label.split(" ")[0]} in Stub</a></p>`,
    );
  }

  await sendEmail({ to: user.email, subject: `Your ${label} spending`, html, text });
  await prisma.monthlyReport.upsert({
    where: { userId_month: { userId: user.id, month: key } },
    create: { userId: user.id, month: key },
    update: { sentAt: new Date() },
  });
  return { skipped: false as const };
}
