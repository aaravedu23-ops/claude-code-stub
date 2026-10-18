"use client";

import { Loader2, LogOut, Send, Shapes } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { sendReportNow, updateSettings } from "@/lib/actions";
import { authClient } from "@/lib/auth-client";
import { Panel } from "./page-header";

export function SettingsForm({
  name: initialName,
  email,
  monthlyEmails: initialMonthly,
  signInMethods,
  emailConfigured,
}: {
  name: string;
  email: string;
  monthlyEmails: boolean;
  signInMethods: string[];
  emailConfigured: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [monthly, setMonthly] = useState(initialMonthly);
  const [saving, startSave] = useTransition();
  const [sending, startSend] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(next: { name?: string; monthlyEmails?: boolean }) {
    setError(null);
    startSave(async () => {
      const res = await updateSettings({ name: next.name ?? name, monthlyEmails: next.monthlyEmails ?? monthly });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Settings saved");
      router.refresh();
    });
  }

  function sendNow() {
    startSend(async () => {
      const res = await sendReportNow();
      if (!res.ok) toast.error(res.error);
      else toast.success(emailConfigured ? `Report sent to ${email}` : "Report printed to the server console (email isn't set up yet)");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Profile">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save({ name });
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <div className="flex gap-2">
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              <Button type="submit" variant="outline" disabled={saving || name.trim() === initialName}>
                {saving ? <Loader2 className="animate-spin" /> : null}
                Save name
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 text-sm">
            <span className="font-medium">Email</span>
            <span className="text-muted-foreground">{email}</span>
          </div>
          <div className="flex flex-col gap-0.5 text-sm">
            <span className="font-medium">Signs in with</span>
            <span className="text-muted-foreground">{[...new Set(signInMethods)].join(", ") || "Email and password"}</span>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
      </Panel>

      <Panel title="Monthly report">
        <div className="flex items-start justify-between gap-6">
          <div>
            <Label htmlFor="monthly" className="text-sm font-medium">
              Email me a monthly report
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">
              On the 1st, get a summary of the month before: totals, budget check-ins, returns, and what changed.
            </p>
          </div>
          <Switch
            id="monthly"
            checked={monthly}
            onCheckedChange={(v) => {
              setMonthly(v);
              save({ monthlyEmails: v });
            }}
          />
        </div>
        <div className="mt-5 border-t pt-4">
          <Button variant="outline" onClick={sendNow} disabled={sending}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            Send last month&apos;s report now
          </Button>
          {!emailConfigured ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Email delivery isn&apos;t set up on this server yet, so reports and password reset codes print to the server console.
            </p>
          ) : null}
        </div>
      </Panel>

      <Panel title="More">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/categories"
            className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3.5 text-sm transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Shapes className="size-4" />
            Manage categories
          </Link>
          <Button
            variant="ghost"
            onClick={async () => {
              await authClient.signOut();
              router.push("/");
              router.refresh();
            }}
          >
            <LogOut />
            Sign out
          </Button>
        </div>
      </Panel>
    </div>
  );
}
