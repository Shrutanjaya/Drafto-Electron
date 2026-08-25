"use client";

import { useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import { saveAs } from "file-saver";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import type { DraftoProject } from "@/lib/schema";
import { generateBriefingNoteDocx } from "@/lib/briefing-note";
import { getSettings } from "./settings-dialog";

// Fired after a successful paper-book generation, carrying annexure id → first
// page. dispatch: window.dispatchEvent(new CustomEvent(BRIEFING_OFFER_EVENT, { detail: { pageByAnnexId } }))
export const BRIEFING_OFFER_EVENT = "drafto-offer-briefing";

// A single, shared prompt (mounted once inside the form provider) that offers to
// generate the quick briefing note after any paper-book — SLP or WP.
export function BriefingNotePrompt() {
  const form = useFormContext<DraftoProject>();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pageByAnnexId, setPageByAnnexId] = useState<Record<string, number>>({});

  useEffect(() => {
    const onOffer = (e: Event) => {
      setPageByAnnexId(((e as CustomEvent).detail?.pageByAnnexId as Record<string, number>) || {});
      setOpen(true);
    };
    window.addEventListener(BRIEFING_OFFER_EVENT, onOffer);
    return () => window.removeEventListener(BRIEFING_OFFER_EVENT, onOffer);
  }, []);

  const generate = async () => {
    setOpen(false);
    try {
      const result = await generateBriefingNoteDocx(form.getValues(), pageByAnnexId);
      if (!result.success || !result.docx) throw new Error("Generation failed");

      // Save next to the other exports (Electron), else download in the browser.
      try {
        if (typeof window !== "undefined" && window.electron?.saveDocx) {
          const savedPath = await window.electron.saveDocx({
            fileName: result.fileName,
            content: result.docx,
            defaultPath: getSettings().defaultDocxPath || undefined,
          });
          if (savedPath) {
            toast({ title: "Briefing Note Generated", description: `Saved to ${savedPath}` });
            window.electron.revealFilePath?.(savedPath);
            return;
          }
        }
      } catch (err) {
        console.error("Electron briefing-note save failed, falling back to download:", err);
      }

      const bytes = Uint8Array.from(atob(result.docx), (c) => c.charCodeAt(0));
      saveAs(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), result.fileName);
      toast({ title: "Briefing Note Generated", description: `${result.fileName} downloaded.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Briefing Note Failed", description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Generate a briefing note?</AlertDialogTitle>
          <AlertDialogDescription>
            Create a quick briefing note — the List of Dates reproduced as a Date / Particulars / Page&nbsp;Nos. table, headed by the cause title — with each row&rsquo;s annexure page number filled in from the paper-book you just generated.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not now</AlertDialogCancel>
          <AlertDialogAction onClick={generate}>Generate briefing note</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
