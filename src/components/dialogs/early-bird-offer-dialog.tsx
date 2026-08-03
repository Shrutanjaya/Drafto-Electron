"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  fetchEarlyBirdOffer,
  acceptEarlyBirdOffer,
  type EarlyBirdState,
} from "@/lib/firebase/early-bird-service";
import { useAuthContext } from "@/providers/auth-provider";
import { useEntitlement } from "@/providers/entitlement-provider";

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

/**
 * One-time migration offer for the original subscribers.
 *
 * Shown on launch to eligible accounts and dismissible — it reappears next time
 * rather than blocking the app, because holding someone's work hostage to a
 * commercial notice is not a good way to thank them for being early. It is only
 * a record of consent if it is freely given.
 *
 * Accepting is what creates the grant. The wording here must stay in step with
 * the confirmation email the Cloud Function sends (EARLY_BIRD_TERMS_VERSION).
 */
export function EarlyBirdOfferDialog() {
  const { user } = useAuthContext();
  const { refresh } = useEntitlement();
  const [state, setState] = useState<EarlyBirdState | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!user) { setOpen(false); return; }
    let cancelled = false;
    fetchEarlyBirdOffer().then((s) => {
      if (cancelled || !s?.eligible) return;
      setState(s);
      setOpen(true);
    });
    return () => { cancelled = true; };
  }, [user]);

  async function handleAccept() {
    setBusy(true);
    setError("");
    const result = await acceptEarlyBirdOffer();
    setBusy(false);
    if (!result?.accepted) {
      setError("We could not record that just now. Please try again, or write to drafto@quindoph.com.");
      return;
    }
    setDone(true);
    refresh(); // pick up the new coverage without a restart
  }

  if (!state) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {done ? "Thank you — that's confirmed" : "Hey there!"}
          </DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              Your subscription now includes all court and document types until{" "}
              <strong className="text-foreground">{fmt(state.suiteUntil)}</strong>. We have emailed
              you a confirmation for your records.
            </p>
            <p>You can start drafting for the new courts straight away.</p>
            <div className="pt-2">
              <Button onClick={() => setOpen(false)}>Continue</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              Drafto is slowly expanding to other courts and document types. The immediate
              additions are <strong className="text-foreground">Writ Petitions in the High Court
              of Delhi at New Delhi</strong>, and <strong className="text-foreground">Original
              Applications before the Central Administrative Tribunal</strong> — covering the
              Principal Bench at New Delhi as well as all other regular and circuit benches. We
              are working on delivering more document types for these fora (including replies and
              rejoinders), as well as adding a few other courts and tribunals to the app.
            </p>
            <p>
              Amidst all this, we want to express our gratitude to you and our other earliest
              customers for your faith in Drafto. As a token of our appreciation, your
              subscription <strong className="text-foreground">will stand migrated to Drafto&rsquo;s
              soon-to-be-announced Max Plan</strong>, which includes all court and document types,
              at no extra cost, until <strong className="text-foreground">{fmt(state.suiteUntil)}</strong>{" "}
              — including all updates and additions we release during that period. Your current
              price of <strong className="text-foreground">&#8377;{state.price} per month will not
              change</strong> during this period.
            </p>
            <p>
              After {fmt(state.suiteUntil)}, your subscription will return to Supreme Court work
              only, unless you move to a current plan at the price then applicable.
            </p>
            <p>
              This offer is open for acceptance until{" "}
              <strong className="text-foreground">{fmt(state.deadline)}</strong>. By clicking
              &ldquo;I accept&rdquo; below, you confirm that you have read and accepted these
              terms. If it is not accepted by then, your subscription simply continues exactly as
              it is today, for Supreme Court work — nothing is taken away.
            </p>
            <p>
              We thank you once again for your faith in Drafto, and we welcome any feedback you
              might have. You can write to us at{" "}
              <span className="text-foreground">drafto@quindoph.com</span> or{" "}
              <span className="text-foreground">support@quindoph.com</span>.
            </p>

            {error && <p className="text-destructive">{error}</p>}

            <div className="flex flex-wrap gap-3 pt-2">
              <Button onClick={handleAccept} disabled={busy}>
                {busy ? "Recording…" : "I accept"}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                Remind me later
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
