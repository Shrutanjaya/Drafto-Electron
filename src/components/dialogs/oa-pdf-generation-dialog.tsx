"use client";

import { useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import { Upload, Trash2, Loader2, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import { pickFile } from "@/lib/utils/pick-file";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OcrOption } from "./ocr-option";
import type { DraftoProject } from "@/lib/schema";
import { wpAnnexureOrder } from "@/lib/wp/wp-annexures";
import { useExportPermission } from "@/providers/entitlement-provider";

/**
 * Pre-flight + upload slots for the CAT Original Application paper-book. The
 * generated components are assembled automatically; this collects the filing
 * documents and any signed/executed copies that replace the clean versions.
 */
export function OaPdfGenerationDialog({
  children,
  onGenerate,
  isPending,
}: {
  children: React.ReactNode;
  onGenerate: (opts?: { ocr?: boolean }) => void;
  isPending?: boolean;
}) {
  const form = useFormContext<DraftoProject>();
  const [open, setOpen] = useState(false);
  // Windows-only; the control disables itself on a Mac.
  const [ocr, setOcr] = useState(false);
  // Both questions: subscription in good standing, and this court on the plan.
  const permission = useExportPermission("OriginalApplicationCAT");
  const canExport = permission.allowed;

  useEffect(() => {
    const openFromAssistant = () => setOpen(true);
    window.addEventListener("drafto-open-paperbook", openFromAssistant);
    return () => window.removeEventListener("drafto-open-paperbook", openFromAssistant);
  }, []);

  // Upload row for an arbitrary form path holding { file, filePath }.
  const uploadRow = (path: string, label: string, hint: string, indent = false) => {
    const val: any = form.watch(path as any);
    const has = val?.file instanceof File || !!val?.filePath;
    const fileName = val?.file?.name || (val?.filePath ? String(val.filePath).split(/[\\/]/).pop() : "");
    const pick = async () => {
      const f = await pickFile();
      if (f) {
        form.setValue(`${path}.file` as any, f, { shouldDirty: true });
        form.setValue(`${path}.filePath` as any, (f as any).path);
      }
    };
    const clear = () => {
      form.setValue(`${path}.file` as any, undefined, { shouldDirty: true });
      form.setValue(`${path}.filePath` as any, undefined);
    };
    return (
      <div key={path} className={"flex items-center justify-between gap-2 rounded-md border p-2 " + (indent ? "ml-4" : "")}>
        <div className="min-w-0">
          <p className="text-xs font-medium">{label}</p>
          <p className={"truncate text-[11px] " + (has ? "text-muted-foreground" : "text-amber-600 dark:text-amber-500")}>{has ? fileName : hint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" size="sm" variant="outline" onClick={pick}>
            <Upload className="mr-1 h-3.5 w-3.5" />{has ? "Replace" : "Upload"}
          </Button>
          {has && (
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={clear}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  const slot = (key: string, label: string, hint: string) =>
    uploadRow(`oa.uploads.${key}`, label, hint);

  // One signed-affidavit slot per application (PT first, then the MAs), matching
  // the paper-book order.
  const watchedMas = form.watch("oa.mas");
  const maRows = (() => {
    const list = (watchedMas || []) as any[];
    const label = (m: any) =>
      m.kind === "pt" ? "Petition for Transfer"
      : m.kind === "delay" ? "MA (Condonation of Delay)"
      : m.kind === "joinder" ? "MA (Joinder of Applicants)"
      : m.kind === "exemptCopies" ? "MA (Exemption — Copies)"
      : m.kind === "exemptTranslation" ? "MA (Exemption — Translations)"
      : "MA (Custom)";
    const order = [...list.filter((m) => m.kind === "pt"), ...list.filter((m) => m.kind !== "pt")];
    return order.map((m) => ({
      path: `oa.mas.${list.findIndex((x) => x.id === m.id)}.signedAffidavit`,
      label: label(m),
    }));
  })();

  // Annexure rows, in A-order, resolved back to their List-of-Dates paths so the
  // dialog edits the very same files the annexure dialog does.
  const watchedLod = form.watch("listOfDates");
  const annexRows = (() => {
    if (!open) return [] as any[];
    const proj = form.getValues();
    const pathOf = (annexId: string) => {
      const lods = proj.listOfDates || [];
      for (let i = 0; i < lods.length; i++) {
        const j = (lods[i].annexures || []).findIndex((a: any) => a.id === annexId);
        if (j >= 0) return `listOfDates.${i}.annexures.${j}`;
      }
      return null;
    };
    return wpAnnexureOrder(proj).map((e: any) => {
      const path = pathOf(e.annex.id);
      if (!path) return null;
      const isColly = !!e.annex.isColly;
      return {
        path,
        label: `Annexure A-${e.pNumber}${isColly ? " (Colly)" : ""}`,
        title: e.annex.title || "[description]",
        colly: isColly,
        constituents: isColly
          ? (e.annex.collyDocuments || []).map((cd: any, k: number) => ({
              path: `${path}.collyDocuments.${k}`,
              label: cd.title || `Document ${k + 1}`,
            }))
          : undefined,
      };
    }).filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })();
  void watchedLod; // re-render the rows when annexures change

  // Pre-flight: annexures without a file still occupy a blank page.
  const project = open ? form.getValues() : null;
  const missingAnnexures = project
    ? wpAnnexureOrder(project).filter((e: any) => {
        const a = e.annex;
        if (a.isColly) return !(a.collyDocuments || []).some((c: any) => c.file || c.filePath);
        return !a.file && !a.filePath;
      })
    : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Generate Original Application Paperbook</DialogTitle>
          <DialogDescription>
            Every drafted component is generated automatically. Upload the filing
            documents and any signed copies to merge into the PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-2 overflow-auto pr-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filing documents</p>
          {slot("courtFee", "Court Fee", "Fee receipt (PDF or image). Leave blank to insert it physically at filing.")}
          {slot("proofOfService", "Proof of Service", "Advance-service email / acknowledgement.")}

          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signed / executed copies</p>
          <p className="text-[11px] text-muted-foreground">Optional — when uploaded, these replace the generated clean version.</p>
          {slot("signedLastPage", "Last Page(s)", "Signed last page(s) — one per Applicant where several sign.")}
          {slot("signedVakalatnama", "Vakalatnama", "Signed / stamped vakalatnama PDF.")}
          {/* One affidavit per application — these are what the Applicant(s) sign. */}
          {maRows.map((r) => uploadRow(r.path, `${r.label} — Affidavit`, "Notarised affidavit PDF."))}

          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Annexures</p>
          <p className="text-[11px] text-muted-foreground">
            Upload each annexure here or from the List of Dates — it is the same file. An annexure with no file still occupies a page so the Index numbering stays correct.
          </p>
          {annexRows.length === 0 && (
            <p className="text-[11px] italic text-muted-foreground">No annexures yet — attach them to List-of-Dates rows.</p>
          )}
          {annexRows.map((r) =>
            r.colly
              ? (
                <div key={r.path} className="space-y-1">
                  <p className="text-[11px] font-medium">{r.label} — {r.title}</p>
                  {r.constituents!.length === 0 && (
                    <p className="ml-4 text-[11px] italic text-amber-600 dark:text-amber-500">No constituent documents added yet.</p>
                  )}
                  {r.constituents!.map((c) => uploadRow(c.path, c.label, "No file uploaded.", true))}
                </div>
              )
              : uploadRow(r.path, `${r.label} — ${r.title}`, "No file uploaded.")
          )}

          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pre-flight check</p>
          {missingAnnexures.length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />All annexures have a file.
            </p>
          ) : (
            <ul className="space-y-1">
              {missingAnnexures.map((e: any) => (
                <li key={e.annex.id} className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-600 dark:text-amber-500">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>Annexure A-{e.pNumber} has no file — a blank page is inserted so the page numbers stay correct.</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t pt-2">
          <OcrOption checked={ocr} onChange={setOcr} disabled={isPending} />
        </div>
        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col sm:items-stretch">
          {!canExport && (
            <p className="text-[11px] text-destructive">
              {permission.reason === "court"
                ? "Original Applications are not included in your plan, so this paper-book cannot be generated."
                : "Paperbook generation is disabled because your subscription isn’t active."}
            </p>
          )}
          <Button
            type="button"
            onClick={() => { onGenerate({ ocr }); setOpen(false); }}
            disabled={isPending || !canExport}
          >
            {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileText className="mr-1 h-4 w-4" />}
            Generate Paperbook (PDF)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
