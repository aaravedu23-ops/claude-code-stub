import { Resend } from "resend";

type Email = { to: string; subject: string; html: string; text: string };

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export const emailEnabled = resend !== null;

/**
 * Sends through Resend when RESEND_API_KEY is set. Otherwise prints the
 * message to the server console so reset codes still work in development.
 */
export async function sendEmail({ to, subject, html, text }: Email) {
  if (!resend) {
    console.log(
      `\n──── email to ${to} ────\nSubject: ${subject}\n\n${text}\n────────────────────────\n`,
    );
    return;
  }
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Stub <onboarding@resend.dev>",
    to,
    subject,
    html,
    text,
  });
  if (error) throw new Error(`Email to ${to} failed: ${error.message}`);
}

export function emailShell(body: string) {
  return `<!doctype html><html><body style="margin:0;background:#F4F5F7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#172033">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #E1E4EA;border-radius:14px">
<tr><td style="padding:32px 32px 8px;font-family:Georgia,serif;font-size:22px;letter-spacing:-0.02em">Stub</td></tr>
<tr><td style="padding:8px 32px 32px;font-size:15px;line-height:1.6">${body}</td></tr>
</table>
<p style="font-size:12px;color:#5E6675;margin-top:16px">You're getting this because you have a Stub account.</p>
</td></tr></table></body></html>`;
}
