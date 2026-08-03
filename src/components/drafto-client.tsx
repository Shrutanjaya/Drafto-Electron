
"use client";

import { useEffect } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { draftoProjectSchema, type DraftoProject } from "@/lib/schema";
import { newBlankProject } from "@/lib/project-defaults";
import { Card } from "@/components/ui/card";
import { Header } from "@/components/header";
import { Workspace } from "@/components/workspace";
import { FindReplaceBar } from "@/components/custom/find-replace-bar";
import { AiChatPanel } from "@/components/custom/ai-chat-panel";
import { BriefingNotePrompt } from "@/components/dialogs/briefing-note-prompt";
import { FieldRevealProvider } from "@/components/custom/field-reveal-provider";
import { EntitlementProvider, useEntitlement, useCanDraft } from "@/providers/entitlement-provider";
import type { CourtType } from "@/lib/entitlement/entitlement";
import { EarlyBirdOfferDialog } from "@/components/dialogs/early-bird-offer-dialog";
import { EntitlementBanner } from "@/components/custom/entitlement-banner";
import { ReadOnlyLock } from "@/components/custom/read-only-lock";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { useToast } from "@/hooks/use-toast";

export function DraftoClient() {
  return (
    <EntitlementProvider>
      <DraftoClientInner />
    </EntitlementProvider>
  );
}

function DraftoClientInner() {
  const form = useForm<DraftoProject>({
    resolver: zodResolver(draftoProjectSchema),
    defaultValues: newBlankProject(),
    // mode: 'onChange' // This can be performance intensive
  });

  const { undo, redo, canUndo, canRedo } = useUndoRedo(form);
  const { toast } = useToast();
  const { entitlement } = useEntitlement();

  // Two independent reasons the workspace can be locked:
  //   • the subscription has lapsed  → read-only, "renew" banner
  //   • the open matter's document type is not on their plan → read-only,
  //     "upgrade" banner (the account itself is in perfectly good standing)
  // A grandfathered Early-Bird customer opening a Writ Petition after their
  // one-year grant expires hits the second, not the first.
  const courtType = (form.watch("courtType") ?? "SLP") as CourtType;
  const covered = useCanDraft(courtType);
  const readOnly = entitlement.access === "readonly" || !covered;

  // Listen for background OCR dependency setup
  useEffect(() => {
    if (!window.electron) return;
    let toastShown = false;
    window.electron.onPythonDepsLog((msg) => {
      if (!toastShown) {
        toastShown = true;
        toast({ title: "Setting up OCR engine…", description: msg, duration: 8000 });
      }
    });
    window.electron.onPythonDepsReady((ready) => {
      if (ready) {
        toast({ title: "OCR engine ready", description: "All dependencies installed successfully.", duration: 4000 });
      }
    });
  }, [toast]);

  return (
    <FormProvider {...form}>
      <FieldRevealProvider>
        <Card className="border-2 shadow-xl">
          <EntitlementBanner uncoveredCourtType={covered ? null : courtType} />
          <EarlyBirdOfferDialog />
          <Header undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} />
          <main>
            {/* Read-only lapse enforcement: lock editing across both the SC and
                HC interfaces while still allowing reading, selecting, scrolling,
                and tab/section navigation. Nothing is disabled or blurred. */}
            <ReadOnlyLock active={readOnly}>
              <Workspace />
            </ReadOnlyLock>
          </main>
        </Card>
        <FindReplaceBar />
        <AiChatPanel />
        <BriefingNotePrompt />
      </FieldRevealProvider>
    </FormProvider>
  );
}
