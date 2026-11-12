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
import { cn } from "@/lib/utils";

interface ModeSelectDialogProps {
  open: boolean;
  onSelect: (courtType: DraftoProject["courtType"]) => void;
}

interface ModeOption {
  courtType: CourtType;
  icon: typeof Scale;
  title: string;
  forum: string;
  subtitle?: string;
  beta?: boolean;
}

const SC_OPTIONS: ModeOption[] = [
  {
    courtType: "SLP",
    icon: Scale,
    title: "Special Leave Petition",
    forum: "Supreme Court of India",
    subtitle: "Under Article 136 of the Constitution",
  },
  {
    courtType: "Appeal",
    icon: Scale,
    title: "Appeal",
    forum: "Supreme Court of India",
    subtitle: "Under a statutory right of appeal",
    beta: true,
  },
  {
    courtType: "WritPetitionSC",
    icon: Scale,
    title: "Writ Petition",
    forum: "Supreme Court of India",
    subtitle: "Under Article 32 of the Constitution",
    beta: true,
  },
  {
    courtType: "WritPetitionPIL",
    icon: Scale,
    title: "Writ Petition (PIL)",
    forum: "Supreme Court of India",
    subtitle: "Public interest litigation under Article 32",
    beta: true,
  },
];

const DHC_OPTION: ModeOption = {
  courtType: "WritPetitionDHC",
  icon: Landmark,
  title: "Writ Petition",
  forum: "High Court of Delhi at New Delhi",
  subtitle: "Under Article 226 of the Constitution",
  beta: true,
};

const CAT_OPTION: ModeOption = {
  courtType: "OriginalApplicationCAT",
  icon: Building2,
  title: "Original Application",
  forum: "Central Administrative Tribunal",
  subtitle: "Central Administrative Tribunal (Principal Bench)",
  beta: true,
};

// Same chip as Mayur and Import tracked changes.
const BetaChip = () => (
  <span className="rounded bg-amber-100 px-1 py-0.5 text-[8.5px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
    Beta
  </span>
);

// Startup / "New Project" prompt: the user chooses what they want to draft.
// Controlled open with no onOpenChange — a choice is required to dismiss, so the
// app never sits in an undecided state. The chosen value drives `courtType`,
// which the Workspace branches on to load the matching interface.
//
// Document types outside the user's plan are SHOWN but locked, so people can
// see what Drafto does and what it would cost to unlock — leaving a Niche subscriber with no idea High Court drafting exists.
export function ModeSelectDialog({ open, onSelect }: ModeSelectDialogProps) {
  const { openManageSubscription } = useEntitlement();
  const hasFreeSlot = useHasFreeForumSlot();

  // Hooks cannot be called in a loop, so resolve each option up front.
  const canDraftSlp = useCanDraft("SLP");
  const canDraftAppeal = useCanDraft("Appeal");
  const canDraftScWp = useCanDraft("WritPetitionSC");
  const canDraftPil = useCanDraft("WritPetitionPIL");
  const canDraftWp = useCanDraft("WritPetitionDHC");
  const canDraftOa = useCanDraft("OriginalApplicationCAT");
  const allowed: Record<CourtType, boolean> = {
    SLP: canDraftSlp,
    Appeal: canDraftAppeal,
    WritPetitionSC: canDraftScWp,
    WritPetitionPIL: canDraftPil,
    WritPetitionDHC: canDraftWp,
    OriginalApplicationCAT: canDraftOa,
  };

  const renderOptionCard = (o: ModeOption) => {
    const Icon = o.icon;
    const unlocked = allowed[o.courtType];

    if (unlocked) {
      return (
        <Button
          key={o.courtType}
          type="button"
          variant="outline"
          className="flex h-auto w-full flex-col items-start gap-0.5 whitespace-normal py-2 px-2.5 text-left transition-colors hover:border-primary/50 hover:bg-accent/40"
          onClick={() => onSelect(o.courtType)}
        >
          <span className="flex items-center gap-1.5 font-semibold text-xs leading-none">
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {o.title}
            {o.beta && <BetaChip />}
          </span>
          <span className="text-[11px] font-normal text-muted-foreground leading-tight">
            {o.subtitle || o.forum}
          </span>
        </Button>
      );
    }

    return (
      <div
        key={o.courtType}
        className="flex h-auto w-full flex-col items-start gap-0.5 rounded-md border border-dashed py-2 px-2.5 text-left opacity-70"
      >
        <span className="flex items-center gap-1.5 font-semibold text-xs leading-none text-muted-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          {o.title}
          {o.beta && <BetaChip />}
        </span>
        <span className="text-[11px] font-normal text-muted-foreground leading-tight">
          {o.subtitle || o.forum}
        </span>
        <button
          type="button"
          onClick={openManageSubscription}
          className="mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold text-primary transition hover:bg-accent"
        >
          <Lock className="h-2.5 w-2.5 shrink-0" />
          {/* An unspent court slot means this costs nothing to unlock. */}
          {hasFreeSlot ? "Add this court" : "Upgrade to access"}
        </button>
      </div>
    );
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-[540px] p-4 sm:p-5" showClose={false}>
        <DialogHeader className="space-y-0.5">
          <DialogTitle className="text-base font-bold">What would you like to draft?</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Choose a document type to begin. You can switch anytime via File → New Project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Supreme Court */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <Scale className="h-3 w-3 text-indigo-500" />
              <span>Supreme Court of India</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SC_OPTIONS.map(renderOptionCard)}
            </div>
          </div>

          {/* Delhi High Court & CAT (PB) */}
          <div className={cn("grid grid-cols-1 gap-2.5", OA_ENABLED ? "sm:grid-cols-2" : "")}>
            {/* Delhi High Court */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <Landmark className="h-3 w-3 text-teal-500" />
                <span>High Court of Delhi</span>
              </div>
              <div>
                {renderOptionCard(DHC_OPTION)}
              </div>
            </div>

            {/* Central Administrative Tribunal */}
            {OA_ENABLED && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <Building2 className="h-3 w-3 text-amber-500" />
                  <span>CAT (PB)</span>
                </div>
                <div>
                  {renderOptionCard(CAT_OPTION)}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
