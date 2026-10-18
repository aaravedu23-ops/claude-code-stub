import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { prisma } from "@/lib/db";
import { appUrl, vercelOrigins } from "@/lib/app-url";
import { emailShell, sendEmail } from "@/lib/email";

export const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

export const MIN_PASSWORD_LENGTH = 8;

export const auth = betterAuth({
  baseURL: appUrl(),
  trustedOrigins: vercelOrigins(),
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    autoSignIn: true,
  },
  socialProviders: googleEnabled
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        },
      }
    : {},
  // Email codes are only used to reset a password. Everything else the
  // email-OTP plugin offers (code sign-in, email change) is switched off.
  disabledPaths: [
    "/sign-in/email-otp",
    "/email-otp/send-verification-otp",
    "/email-otp/check-verification-otp",
    "/email-otp/verify-email",
    "/email-otp/request-email-change",
    "/email-otp/change-email",
  ],
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 10,
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== "forget-password") return;
        await sendEmail({
          to: email,
          subject: `${otp} is your Stub reset code`,
          text: `Your Stub password reset code is ${otp}.\n\nIt expires in 10 minutes. If you didn't ask to reset your password, you can ignore this email.`,
          html: emailShell(
            `<p style="margin:0 0 16px">Use this code to reset your Stub password. It expires in 10 minutes.</p>
<p style="margin:0 0 20px;font-family:Georgia,serif;font-size:36px;letter-spacing:0.18em">${otp}</p>
<p style="margin:0;font-size:13px;color:#5E6675">If you didn't ask to reset your password, you can ignore this email.</p>`,
          ),
        });
      },
    }),
    // Must stay last so cookies set inside server actions reach the browser.
    nextCookies(),
  ],
});
