"use client";

import { Archive, Loader2, Lock, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { archiveCard, createCard, updateCard } from "@/lib/actions";
import { CARD_FACES, CARD_NETWORKS } from "@/lib/catalog";
import { money } from "@/lib/format";
import type { CardOption } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CardFace } from "./card-face";
import { NativeSelect } from "./expense-sheet";

type Editing = CardOption | "new" | null;

export function CardManager({ cards, spend }: { cards: CardOption[]; spend: Record<string, number> }) {
  const [editing, setEditing] = useState<Editing>(cards.length === 0 ? "new" : null);

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.id} className="group">
            <button
              type="button"
              onClick={() => setEditing(c)}
              aria-label={`Edit ${c.nickname}`}
              className="block w-full cursor-pointer rounded-[14px] transition-transform duration-200 ease-(--ease-spring) hover:-translate-y-1 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-0 active:scale-[0.99]"
            >
              <CardFace
                nickname={c.nickname}
                issuer={c.issuer}
                network={c.network}
                last4={c.last4}
                holderName={c.holderName}
                expiry={c.expMonth && c.expYear ? `${String(c.expMonth).padStart(2, "0")}/${String(c.expYear).slice(-2)}` : null}
                color={c.color}
              />
            </button>
            <div className="mt-3 flex items-center justify-between px-1 text-sm">
              <span className="text-muted-foreground">This month</span>
              <span className="num font-medium">{money(spend[c.id] ?? 0)}</span>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex aspect-[1.586] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-input text-muted-foreground transition-[border-color,color,background-color] duration-150 hover:border-primary/50 hover:bg-carbon-wash/40 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.99]"
        >
          <Plus className="size-6" />
          <span className="font-medium">Add a card</span>
        </button>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:max-w-lg">
          {editing ? (
            <CardForm key={editing === "new" ? "new" : editing.id} card={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CardForm({ card, onDone }: { card: CardOption | null; onDone: () => void }) {
  const router = useRouter();
  const [nickname, setNickname] = useState(card?.nickname ?? "");
  const [issuer, setIssuer] = useState(card?.issuer ?? "");
  const [network, setNetwork] = useState<(typeof CARD_NETWORKS)[number]>((card?.network as (typeof CARD_NETWORKS)[number]) ?? "Visa");
  const [last4, setLast4] = useState(card?.last4 ?? "");
  const [holderName, setHolderName] = useState(card?.holderName ?? "");
  const [expiry, setExpiry] = useState(
    card?.expMonth && card.expYear ? `${String(card.expMonth).padStart(2, "0")}/${String(card.expYear).slice(-2)}` : "",
  );
  const [color, setColor] = useState(card?.color ?? CARD_FACES[1].color);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [pending, startTransition] = useTransition();

  function onExpiry(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    setExpiry(digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = { nickname, issuer, network, last4, holderName, expiry, color };
    startTransition(async () => {
      const res = card ? await updateCard(card.id, input) : await createCard(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(card ? "Card updated" : "Card added");
      onDone();
      router.refresh();
    });
  }

  function archive() {
    if (!card) return;
    startTransition(async () => {
      await archiveCard(card.id);
      toast.success(`${card.nickname} removed`);
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} noValidate>
      <DialogHeader>
        <DialogTitle className="text-2xl tracking-[-0.02em]">{card ? "Edit card" : "Add a card"}</DialogTitle>
        <DialogDescription>Fill it in once. After that you just pick it when you log an expense.</DialogDescription>
      </DialogHeader>

      <div className="mx-auto mt-5 w-full max-w-xs">
        <CardFace
          nickname={nickname}
          issuer={issuer}
          network={network}
          last4={last4}
          holderName={holderName}
          expiry={expiry.length === 5 ? expiry : null}
          color={color}
        />
      </div>

      <div role="radiogroup" aria-label="Card color" className="mt-4 flex justify-center gap-2">
        {CARD_FACES.map((f) => (
          <button
            key={f.color}
            type="button"
            role="radio"
            aria-checked={color === f.color}
            aria-label={f.name}
            title={f.name}
            onClick={() => setColor(f.color)}
            className={cn(
              "h-6 w-9 cursor-pointer rounded-[5px] shadow-raise ring-offset-2 ring-offset-popover transition-transform duration-150 ease-(--ease-spring) hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-95",
              color === f.color && "ring-2 ring-foreground",
            )}
            style={{ background: f.color }}
          />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="nickname">Nickname</Label>
          <Input id="nickname" placeholder="Everyday card" value={nickname} onChange={(e) => setNickname(e.target.value)} autoFocus={!card} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="issuer">Bank</Label>
          <Input id="issuer" placeholder="Harbor Credit Union" value={issuer} onChange={(e) => setIssuer(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="network">Network</Label>
          <NativeSelect id="network" value={network} onChange={(v) => setNetwork(v as (typeof CARD_NETWORKS)[number])}>
            {CARD_NETWORKS.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="last4">Last 4 digits</Label>
          <Input
            id="last4"
            inputMode="numeric"
            autoComplete="off"
            placeholder="4417"
            maxLength={4}
            className="num tracking-[0.2em]"
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expiry">
            Expires <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input id="expiry" inputMode="numeric" placeholder="MM/YY" className="num" value={expiry} onChange={(e) => onExpiry(e.target.value)} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="holder">
            Name on card <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input id="holder" autoComplete="off" value={holderName} onChange={(e) => setHolderName(e.target.value)} />
        </div>
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        Stub only keeps the last four digits so it can match receipts to this card. Never enter the full card number or
        security code.
      </p>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex items-center gap-2">
        {card ? (
          confirmArchive ? (
            <div className="mr-auto flex items-center gap-1.5">
              <Button type="button" variant="destructive" size="sm" onClick={archive} disabled={pending}>
                Remove card
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmArchive(false)}>
                Keep it
              </Button>
            </div>
          ) : (
            <Button type="button" variant="ghost" className="mr-auto text-muted-foreground" onClick={() => setConfirmArchive(true)}>
              <Archive />
              Remove
            </Button>
          )
        ) : (
          <span className="mr-auto" />
        )}
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : card ? <Pencil /> : null}
          {card ? "Save card" : "Add card"}
        </Button>
      </div>
      {card && confirmArchive ? (
        <p className="mt-3 text-xs text-muted-foreground">Past expenses keep showing this card. It just won&apos;t be offered for new ones.</p>
      ) : null}
    </form>
  );
}
