"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Landmark, Scale, Building2, Lock } from "lucide-react";
import type { DraftoProject } from "@/lib/schema";
import { OA_ENABLED } from "@/lib/oa/oa-enabled";
import { useEntitlement, useCanDraft, useHasFreeForumSlot } from "@/providers/entitlement-provider";
import type { CourtType } from "@/lib/entitlement/entitlement";

interface ModeSelectDialogProps {
  open: boolean;
  onSelect: (courtType: DraftoProject["courtType"]) => void;
}

interface ModeOption {
  courtType: CourtType;
  icon: typeof Scale;
  title: string;
  forum: string;
}

const OPTIONS: ModeOption[] = [
  {
    courtType: "SLP",
    icon: Scale,
    title: "Special Leave Petition",
    forum: "Supreme Court of India",
  },
  {
    courtType: "WritPetitionDHC",
    icon: Landmark,
    title: "Writ Petition",
    forum: "High Court of Delhi at New Delhi",
  },
  {
    courtType: "OriginalApplicationCAT",
    icon: Building2,
    title: "Original Application",
    forum: "Central Administrative Tribunal",
  },
];

// Startup / "New Project" prompt: the user chooses what they want to draft.
// Controlled open with no onOpenChange — a choice is required to dismiss, so the
// app never sits in an undecided state. The chosen value drives `courtType`,
// which the Workspace branches on to load the matching interface.
//
// Document types outside the user's plan are SHOWN but locked, so people can
// see what Drafto does and what it would cost to unlock — hiding them would
// leave a Niche subscriber with no idea High Court drafting exists.
export function ModeSelectDialog({ open, onSelect }: ModeSelectDialogProps) {
  const { openManageSubscription } = useEntitlement();
  const hasFreeSlot = useHasFreeForumSlot();

  // Hooks cannot be called in a loop, so resolve each option up front.
  const canDraftSlp = useCanDraft("SLP");
  const canDraftWp = useCanDraft("WritPetitionDHC");
  const canDraftOa = useCanDraft("OriginalApplicationCAT");
  const allowed: Record<CourtType, boolean> = {
    SLP: canDraftSlp,
    WritPetitionDHC: canDraftWp,
    OriginalApplicationCAT: canDraftOa,
  };

  const visible = OPTIONS.filter(
    (o) => o.courtType !== "OriginalApplicationCAT" || OA_ENABLED
  );

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-lg" showClose={false}>
        <DialogHeader>
          <DialogTitle>What would you like to draft?</DialogTitle>
          <DialogDescription>
            Choose a document type to begin. You can start a different type at any
            time via File → New Project.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2">
          {visible.map((o) => {
            const Icon = o.icon;
            const unlocked = allowed[o.courtType];

            if (unlocked) {
              return (
                <Button
                  key={o.courtType}
                  type="button"
                  variant="outline"
                  className="flex h-auto flex-col items-start gap-1 whitespace-normal p-4 text-left"
                  onClick={() => onSelect(o.courtType)}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <Icon className="h-4 w-4 shrink-0" />
                    {o.title}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {o.forum}
                  </span>
                </Button>
              );
            }

            return (
              <div
                key={o.courtType}
                className="flex h-auto flex-col items-start gap-1 rounded-md border border-dashed p-4 text-left opacity-70"
              >
                <span className="flex items-center gap-2 font-semibold text-muted-foreground">
                  <Icon className="h-4 w-4 shrink-0" />
                  {o.title}
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {o.forum}
                </span>
                <button
                  type="button"
                  onClick={openManageSubscription}
                  className="mt-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold text-primary transition hover:bg-accent"
                >
                  <Lock className="h-3 w-3 shrink-0" />
                  {/* An unspent court slot means this costs nothing to unlock. */}
                  {hasFreeSlot ? "Add this court" : "Upgrade to access"}
                </button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
