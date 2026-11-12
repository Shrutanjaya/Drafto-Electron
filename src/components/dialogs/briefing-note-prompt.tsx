"use client";

import { useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import { saveAs } from "file-saver";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { DraftoProject } from "@/lib/schema";
import { generateBriefingNoteDocx, cachePaperbookPages } from "@/lib/briefing-note";
import { getGenerationCounts, computeHoursSaved, formatHours } from "@/lib/firebase/usage-service";
import { getSettings } from "./settings-dialog";
import { FileText, Bookmark, Download, Loader2 } from "lucide-react";

export const BRIEFING_OFFER_EVENT = "drafto-offer-briefing";

export function BriefingNotePrompt() {
  const form = useFormContext<DraftoProject>();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pageByAnnexId, setPageByAnnexId] = useState<Record<string, string | number>>({});
  const [cumulativeHours, setCumulativeHours] = useState<string>("2");
  const [shortBookmarksPdf, setShortBookmarksPdf] = useState<string | null>(null);
  const [shortBookmarksFileName, setShortBookmarksFileName] = useState<string>("Paperbook (Short Bookmarks).pdf");
  const [isGeneratingNote, setIsGeneratingNote] = useState(false);

  useEffect(() => {
    const onOffer = (e: Event) => {
      const detail = ((e as CustomEvent).detail || {}) as {
        pageByAnnexId?: Record<string, string | number>;
        shortBookmarksPdf?: string;
        shortBookmarksFileName?: string;
      };
      const pages = detail.pageByAnnexId || {};
      setPageByAnnexId(pages);
      setShortBookmarksPdf(detail.shortBookmarksPdf || null);
      setShortBookmarksFileName(detail.shortBookmarksFileName || "Paperbook (Short Bookmarks).pdf");

      const projectId = form.getValues().id;
      cachePaperbookPages(projectId, pages);

      // Compute cumulative hours saved
      getGenerationCounts()
        .then((counts) => {
          const total = Math.max(2, computeHoursSaved(counts));
          setCumulativeHours(formatHours(total));
        })
        .catch(() => {
          setCumulativeHours("2");
        });

      setOpen(true);
    };
    window.addEventListener(BRIEFING_OFFER_EVENT, onOffer);
    return () => window.removeEventListener(BRIEFING_OFFER_EVENT, onOffer);
  }, [form]);

  const handleDownloadBriefingNote = async () => {
    setIsGeneratingNote(true);
    try {
      const result = await generateBriefingNoteDocx(form.getValues(), pageByAnnexId);
      if (!result.success || !result.docx) throw new Error("Generation failed");

      try {
        if (typeof window !== "undefined" && window.electron?.saveDocx) {
          const savedPath = await window.electron.saveDocx({
            fileName: result.fileName,
            content: result.docx,
            defaultPath: getSettings().defaultDocxPath || undefined,
          });
          if (savedPath) {
            toast({ title: "Skeletal Briefing Note Saved", description: `Saved to ${savedPath}` });
            window.electron.revealFilePath?.(savedPath);
            return;
          }
        }
      } catch (err) {
        console.error("Electron briefing-note save failed, falling back to download:", err);
      }

      const bytes = Uint8Array.from(atob(result.docx), (c) => c.charCodeAt(0));
      saveAs(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), result.fileName);
      toast({ title: "Skeletal Briefing Note Downloaded", description: `${result.fileName} downloaded.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Skeletal Briefing Note Failed", description: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsGeneratingNote(false);
    }
  };

  const handleDownloadShortBookmarksPdf = async () => {
    if (!shortBookmarksPdf) return;
    try {
      if (typeof window !== "undefined" && window.electron?.savePdf) {
        const savedPath = await window.electron.savePdf({
          fileName: shortBookmarksFileName,
          content: shortBookmarksPdf,
          defaultPath: (getSettings() as any).defaultPdfPath || undefined,
        });
        if (savedPath) {
          toast({ title: "Hearing Copy Saved", description: `Saved to ${savedPath}` });
          window.electron.revealFilePath?.(savedPath);
          return;
        }
      }
      const bytes = Uint8Array.from(atob(shortBookmarksPdf), (c) => c.charCodeAt(0));
      saveAs(new Blob([bytes], { type: "application/pdf" }), shortBookmarksFileName);
      toast({ title: "Hearing Copy Downloaded", description: `${shortBookmarksFileName} downloaded.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Download Failed", description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent className="sm:max-w-md">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-50/80 p-3.5 text-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-200">
          <p className="font-semibold text-emerald-900 dark:text-emerald-100 flex items-center gap-1.5 text-sm">
            <span>🎉</span> Congratulations! You just saved 2 hours of work.
          </p>
          <p className="mt-1 text-xs text-emerald-800/90 dark:text-emerald-300/90">
            Cumulatively, you have now saved <span className="font-bold text-emerald-900 dark:text-emerald-100">{cumulativeHours}</span> hours using PaperBook.
          </p>
        </div>

        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-bold">Courtroom & Briefing Companions</AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-muted-foreground">
            Download optional companions generated from your compiled paper-book:
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2.5 py-1">
          {/* Card 1: Skeletal Briefing Note (.docx) */}
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-card/60 p-3 hover:bg-muted/40 transition-colors">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                <h4 className="text-xs font-semibold text-foreground">Skeletal Briefing Note (.docx)</h4>
              </div>
              <p className="text-[11.5px] text-muted-foreground leading-snug">
                List of Dates reproduced verbatim with actual annexure page numbers, impugned orders, and filing details.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={isGeneratingNote}
              className="shrink-0 h-8 text-xs font-medium"
              onClick={handleDownloadBriefingNote}
            >
              {isGeneratingNote ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-3.5 w-3.5" />
              )}
              Download
            </Button>
          </div>

          {/* Card 2: Hearing Copy with Short Bookmarks (.pdf) */}
          {shortBookmarksPdf && (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-card/60 p-3 hover:bg-muted/40 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Bookmark className="h-4 w-4 text-purple-600 shrink-0" />
                  <h4 className="text-xs font-semibold text-foreground">Hearing Copy with Short Bookmarks (.pdf)</h4>
                </div>
                <p className="text-[11.5px] text-muted-foreground leading-snug">
                  Clean PDF copy optimized for oral arguments & iPad readers (e.g. <span className="font-mono text-[10.5px]">13.01.2026 FIR @37</span>, <span className="font-mono text-[10.5px]">IA-Stay @247</span>, <span className="font-mono text-[10.5px]">01.10.2026 Impugned @1</span>).
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 h-8 text-xs font-medium"
                onClick={handleDownloadShortBookmarksPdf}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download
              </Button>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel className="text-xs h-8">Done</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
