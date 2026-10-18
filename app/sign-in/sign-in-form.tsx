"use client";

import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up" | "forgot" | "reset";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}

const copy: Record<Mode, { title: string; lead: string }> = {
  "sign-in": { title: "Sign in to Stub", lead: "Welcome back." },
  "sign-up": { title: "Create your account", lead: "An email and a password is all it takes." },
  forgot: { title: "Reset your password", lead: "We'll email you a 6-digit code." },
  reset: { title: "Enter your code", lead: "Then choose a new password." },
};

/** Turns Better Auth error codes into plain directions. */
function explain(error: { code?: string; message?: string; status?: number }, mode: Mode) {
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password don't match. Check them, or reset your password.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "There's already an account with this email. Sign in instead.";
    case "PASSWORD_TOO_SHORT":
      return "Use at least 8 characters for your password.";
    case "INVALID_OTP":
      return "That code isn't right. Check the email and try again.";
    case "OTP_EXPIRED":
      return "That code has expired. Send a new one.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many tries with that code. Send a new one.";
  }
  if (error.status === 429) return "Too many attempts. Wait a minute and try again.";
  return error.message ?? (mode === "sign-up" ? "The account couldn't be created. Try again." : "Something went wrong. Try again.");
}

export function SignInForm({
  initialMode,
  googleEnabled,
  emailConfigured,
  minPasswordLength,
}: {
  initialMode: "sign-in" | "sign-up";
  googleEnabled: boolean;
  emailConfigured: boolean;
  minPasswordLength: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState<"form" | "google" | "resend" | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  function go(next: Mode) {
    setMode(next);
    setMessage(null);
    setPassword("");
    setCode("");
  }

  function done() {
    router.push("/overview");
    router.refresh();
  }

  async function sendCode(isResend = false) {
    setPending(isResend ? "resend" : "form");
    const { error } = await authClient.emailOtp.requestPasswordReset({ email });
    setPending(null);
    if (error) {
      setMessage({ tone: "error", text: explain(error, "forgot") });
      return false;
    }
    setMessage({
      tone: "info",
      text: emailConfigured
        ? `If ${email} has a Stub account, a code is on its way. It expires in 10 minutes.`
        : "Email isn't set up on this server yet, so the code was printed to the server console instead of emailed.",
    });
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const err = (text: string) => setMessage({ tone: "error", text });

    if (!/^\S+@\S+\.\S+$/.test(email)) return err("Enter an email address like you@example.com.");

    if (mode === "forgot") {
      if (await sendCode()) setMode("reset");
      return;
    }

    if (mode === "reset" && !/^\d{6}$/.test(code)) return err("Enter the 6-digit code from the email.");
    if (!password) return err(mode === "sign-in" ? "Enter your password." : "Choose a password.");
    if (mode !== "sign-in" && password.length < minPasswordLength) {
      return err(`Use at least ${minPasswordLength} characters for your password.`);
    }

    setPending("form");
    if (mode === "sign-in") {
      const { error } = await authClient.signIn.email({ email, password });
      setPending(null);
      if (error) return err(explain(error, mode));
      return done();
    }

    if (mode === "sign-up") {
      const name = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const { error } = await authClient.signUp.email({ email, password, name });
      setPending(null);
      if (error) return err(explain(error, mode));
      return done();
    }

    // reset
    const { error } = await authClient.emailOtp.resetPassword({ email, otp: code, password });
    if (error) {
      setPending(null);
      return err(explain(error, mode));
    }
    const signedIn = await authClient.signIn.email({ email, password });
    setPending(null);
    if (signedIn.error) {
      go("sign-in");
      setMessage({ tone: "info", text: "Password changed. Sign in with your new password." });
      return;
    }
    done();
  }

  async function google() {
    setMessage(null);
    setPending("google");
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL: "/overview" });
    if (error) {
      setPending(null);
      setMessage({ tone: "error", text: error.message ?? "Google sign-in didn't start. Try again." });
    }
  }

  const passwordField = mode !== "forgot";
  const submitLabel = {
    "sign-in": "Sign in",
    "sign-up": "Create account",
    forgot: "Email me a code",
    reset: "Set new password",
  }[mode];

  return (
    <div>
      {mode === "forgot" || mode === "reset" ? (
        <button
          type="button"
          onClick={() => go("sign-in")}
          className="mb-6 inline-flex cursor-pointer items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowLeft className="size-4" />
          Back to sign in
        </button>
      ) : null}
      <h1 className="text-5xl">{copy[mode].title}</h1>
      <p className="mt-3 text-muted-foreground">{copy[mode].lead}</p>

      {(mode === "sign-in" || mode === "sign-up") && googleEnabled ? (
        <div className="mt-10 flex flex-col gap-6">
          <Button variant="outline" size="lg" className="w-full bg-card" onClick={google} disabled={pending !== null}>
            {pending === "google" ? <Loader2 className="animate-spin" /> : <GoogleIcon />}
            Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or with email
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      ) : null}

      <form onSubmit={submit} className={googleEnabled && (mode === "sign-in" || mode === "sign-up") ? "mt-6 flex flex-col gap-4" : "mt-10 flex flex-col gap-4"} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            readOnly={mode === "reset"}
            className="h-11 text-base read-only:bg-muted"
          />
        </div>

        {mode === "reset" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">6-digit code</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="num h-11 text-lg tracking-[0.4em]"
            />
          </div>
        ) : null}

        {passwordField ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{mode === "reset" ? "New password" : "Password"}</Label>
              {mode === "sign-in" ? (
                <button
                  type="button"
                  onClick={() => go("forgot")}
                  className="cursor-pointer rounded text-sm text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  Forgot password?
                </button>
              ) : null}
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 pr-11 text-base"
                aria-describedby={mode !== "sign-in" ? "password-hint" : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {mode !== "sign-in" ? (
              <p id="password-hint" className="text-xs text-muted-foreground">
                At least {minPasswordLength} characters.
              </p>
            ) : null}
          </div>
        ) : null}

        <Button type="submit" size="lg" className="mt-1 w-full" disabled={pending !== null}>
          {pending === "form" ? <Loader2 className="animate-spin" /> : null}
          {submitLabel}
        </Button>
      </form>

      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "mt-4 text-sm text-destructive" : "mt-4 text-sm text-muted-foreground"}>
          {message.text}
        </p>
      ) : null}

      <div className="mt-8 text-sm text-muted-foreground">
        {mode === "sign-in" ? (
          <p>
            New to Stub?{" "}
            <button type="button" onClick={() => go("sign-up")} className="cursor-pointer font-medium text-primary underline-offset-4 hover:underline">
              Create an account
            </button>
          </p>
        ) : mode === "sign-up" ? (
          <p>
            Already have an account?{" "}
            <button type="button" onClick={() => go("sign-in")} className="cursor-pointer font-medium text-primary underline-offset-4 hover:underline">
              Sign in
            </button>
          </p>
        ) : mode === "reset" ? (
          <p>
            No code?{" "}
            <button
              type="button"
              onClick={() => sendCode(true)}
              disabled={pending !== null}
              className="cursor-pointer font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
            >
              {pending === "resend" ? "Sending…" : "Send a new one"}
            </button>
          </p>
        ) : null}
      </div>
    </div>
  );
}
