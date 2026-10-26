"use client";

import React, { useEffect, useState, useRef } from "react";
import { useFormContext } from "react-hook-form";
import { ArrowUp, ArrowDown, OctagonAlert, AlertTriangle } from "lucide-react";
import { pickFile } from "@/lib/utils/pick-file";
import { Button } from "@/components/ui/button";
import type { DraftoProject } from "@/lib/schema";
import { wpPreflight } from "@/lib/wp/wp-preflight";
import { wpFrontMatterOrder, wpActiveCms, wpCmTitle } from "@/lib/wp/wp-actions";
import { wpAnnexureOrder, annexLabel } from "@/lib/wp/wp-annexures";
import { hasUsableFile, fileNameOf, refreshFileAvailability } from "@/lib/file-availability";
import { annexureDetails } from "@/lib/annexure-details";
import { useEntitlement, useExportPermission } from "@/providers/entitlement-provider";
import { generateWpPdf } from "@/lib/wp/wp-pdf";
import { getSettings } from "@/components/dialogs/settings-dialog";
import { useToast } from "@/hooks/use-toast";
import { saveAs } from "file-saver";
import { incrementGenerationCount } from "@/lib/firebase/usage-service";
import {
  PaperbookGeneratorView,
  type PaperbookItem,
} from "./paperbook-generator-view";

const FRONT_LABELS: Record<"notice" | "urgency" | "memo", string> = {
  notice: "Notice of Motion",
  urgency: "Urgency Application",
  memo: "Memo of Parties",
};

export function WpPdfGenerationDialog({
  children,
  onGenerate,
  isPending: externalIsPending,
}: {
  children: React.ReactNode;
  onGenerate?: (opts?: { ocr?: boolean }) => void;
  isPending?: boolean;
}) {
  const form = useFormContext<DraftoProject>();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [ocr, setOcr] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  const cancelledRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { openManageSubscription } = useEntitlement();
  const permission = useExportPermission("WritPetitionDHC");
  const canExport = permission.allowed;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      abortControllerRef.current?.abort();
      if (typeof window !== "undefined") {
        window.electron?.cancelOcr?.();
      }
    };
  }, []);

  // Prevent closing window while generating
  useEffect(() => {
    if (!isGenerating && !isProcessingOcr) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isGenerating, isProcessingOcr]);

  // Progress timer: 0% to 90% over 60 seconds (matches SLP generator)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isGenerating) {
      setProgress(0);
      const startTime = Date.now();
      interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const seconds = elapsed / 1000;
        const calculatedProgress = Math.min(90, Math.floor(seconds * 1.5));
        setProgress(calculatedProgress);
      }, 100);
    } else {
      setProgress(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isGenerating]);

  const [, setAvailabilityTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const values: any = form.getValues();
    const paths: (string | undefined)[] = [];
    const collect = (entry: any) => {
      if (entry?.filePath) paths.push(entry.filePath);
    };
    for (const row of [...(values.listOfDates || []), ...(values.wp?.factsRows || [])]) {
      for (const a of row.annexures || []) {
        collect(a);
        (a.collyDocuments || []).forEach(collect);
      }
    }
    Object.values(values.wp?.uploads || {}).forEach(collect);
    (values.wp?.customCms || []).forEach((cm: any) => {
      collect(cm.signedAffidavit);
      (cm.grounds || []).forEach((g: any) => (g.annexures || []).forEach(collect));
    });
    ["stay", "lengthySynopsis", "exemptionCopies"].forEach((k) =>
      collect(values.wp?.cms?.[k]?.signedAffidavit)
    );
    refreshFileAvailability(paths).then((changed) => {
      if (changed) setAvailabilityTick((t) => t + 1);
    });
  }, [open, form]);

  useEffect(() => {
    const openFromAssistant = () => setOpen(true);
    window.addEventListener("drafto-open-paperbook", openFromAssistant);
    return () => window.removeEventListener("drafto-open-paperbook", openFromAssistant);
  }, []);

  const syncAnnexureFile = (annexId: string, f?: File, filePath?: string) => {
    const syncRows = (base: string, rows: any[]) => {
      (rows || []).forEach((row: any, ri: number) => {
        (row.annexures || []).forEach((a: any, ai: number) => {
          if (a.id === annexId) {
            form.setValue(`${base}.${ri}.annexures.${ai}.file` as any, f, { shouldDirty: true });
            form.setValue(`${base}.${ri}.annexures.${ai}.filePath` as any, filePath, { shouldDirty: true });
          }
        });
      });
    };
    syncRows("listOfDates", form.getValues("listOfDates"));
    syncRows("wp.factsRows", form.getValues("wp.factsRows" as any));
  };

  const syncCollyFile = (annexId: string, constituentIdx: number, f?: File, filePath?: string) => {
    const syncRows = (base: string, rows: any[]) => {
      rows.forEach((row: any, ri: number) => {
        (row.annexures || []).forEach((a: any, ai: number) => {
          if (a.id === annexId && a.collyDocuments?.[constituentIdx]) {
            form.setValue(`${base}.${ri}.annexures.${ai}.collyDocuments.${constituentIdx}.file` as any, f, { shouldDirty: true });
            form.setValue(`${base}.${ri}.annexures.${ai}.collyDocuments.${constituentIdx}.filePath` as any, filePath, { shouldDirty: true });
          }
        });
      });
    };
    syncRows("listOfDates", form.getValues("listOfDates") || []);
    syncRows("wp.factsRows", form.getValues("wp.factsRows" as any) || []);
  };

  const handlePick = async (path: string, annexId?: string, constituentIdx?: number) => {
    const f = await pickFile();
    if (f) {
      form.setValue(`${path}.file` as any, f, { shouldDirty: true });
      form.setValue(`${path}.filePath` as any, (f as any).path, { shouldDirty: true });
      if (annexId != null) {
        if (constituentIdx != null) {
          syncCollyFile(annexId, constituentIdx, f, (f as any).path);
        } else {
          syncAnnexureFile(annexId, f, (f as any).path);
        }
      }
    }
  };

  const handleClear = (path: string, annexId?: string, constituentIdx?: number) => {
    form.setValue(`${path}.file` as any, undefined, { shouldDirty: true });
    form.setValue(`${path}.filePath` as any, undefined, { shouldDirty: true });
    if (annexId != null) {
      if (constituentIdx != null) {
        syncCollyFile(annexId, constituentIdx, undefined, undefined);
      } else {
        syncAnnexureFile(annexId, undefined, undefined);
      }
    }
  };

  const project = form.watch();

  // Front matter order
  const order = wpFrontMatterOrder(project as DraftoProject);
  const move = (index: number, dir: -1 | 1) => {
    const next = [...order];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    form.setValue("wp.frontMatterOrder", next, { shouldDirty: true });
  };

  // Preflight
  const issues = open ? wpPreflight(form.getValues()) : [];
  const issuesFor = (target: string) => issues.filter((i) => i.target === target);

  const IssueList = ({ target }: { target: string }) => {
    const list = issuesFor(target);
    if (!list.length) return null;
    return (
      <ul className="mt-1 space-y-0.5">
        {list.map((issue, i) => (
          <li
            key={i}
            className={`flex items-start gap-1.5 text-[11px] leading-snug ${
              issue.severity === "error"
                ? "text-destructive"
                : "text-amber-600 dark:text-amber-500"
            }`}
          >
            {issue.severity === "error" ? (
              <OctagonAlert className="mt-0.5 h-3 w-3 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            )}
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    );
  };

  // --- SECTIONS MATCHING INDEX ORDER ---
  let sNoCounter = 1;

  // 1. INITIAL
  const initialItems: PaperbookItem[] = [];

  // Front matter (Notice, Urgency, Memo in configured order)
  order.forEach((k) => {
    initialItems.push({
      id: k,
      sNo: sNoCounter++,
      particulars: (
        <div>
          <span className="font-medium">{FRONT_LABELS[k]}</span>
          <p className="text-[11px] text-muted-foreground">Auto-generated from case details.</p>
        </div>
      ),
      status: "auto_ready",
      extra: <IssueList target={k === "memo" ? "parties" : k} />,
    });
  });

  // Synopsis and List of Dates
  initialItems.push({
    id: "slod",
    sNo: sNoCounter++,
    particulars: (
      <div>
        <span className="font-medium">Synopsis and List of Dates</span>
        <p className="text-[11px] text-muted-foreground">Auto-generated from Synopsis and LoD.</p>
      </div>
    ),
    status: "auto_frozen",
    lockedTooltip: "Synopsis and List of Dates contains auto-calculated references; cannot be replaced",
    extra: <IssueList target="synopsis" />,
  });

  // Writ Petition
  const petitionAffVal = form.watch("wp.uploads.signedAffidavit" as any);
  const hasPetitionAff = hasUsableFile(petitionAffVal);
  const petitionAffFileName = petitionAffVal?.file?.name || fileNameOf(petitionAffVal?.filePath);

  initialItems.push({
    id: "petition",
    label: "Writ Petition Affidavit",
    sNo: sNoCounter++,
    particulars: (
      <div>
        <span className="font-medium">
          Writ Petition under Article {project.wp?.articleBasis || "226"} of the Constitution of India, with affidavit
        </span>
        <p className="text-[11px] text-muted-foreground">
          Petition auto-generated. Signed/notarized affidavit required.
        </p>
      </div>
    ),
    status: hasPetitionAff ? "user_uploaded" : "mandatory_missing",
    fileName: petitionAffFileName,
    onUpload: () => handlePick("wp.uploads.signedAffidavit"),
    onRemove: hasPetitionAff ? () => handleClear("wp.uploads.signedAffidavit") : undefined,
    extra: <IssueList target="affidavit" />,
  });

  // 2. ANNEXURES
  const annexureItems: PaperbookItem[] = [];
  const annexures = open ? wpAnnexureOrder(project as DraftoProject) : [];

  const annexureRows: any[] = (project as any).wp?.factsRows?.some((r: any) => (r.annexures || []).length)
    ? (project as any).wp.factsRows
    : project.listOfDates || [];
  const annexureBase = annexureRows === (project.listOfDates || []) ? "listOfDates" : "wp.factsRows";
  const annexurePath = (id: string) => {
    const rowIdx = annexureRows.findIndex((r: any) => (r.annexures || []).some((a: any) => a.id === id));
    if (rowIdx < 0) return "";
    const colIdx = (annexureRows[rowIdx].annexures || []).findIndex((a: any) => a.id === id);
    return `${annexureBase}.${rowIdx}.annexures.${colIdx}`;
  };

  annexures.forEach(({ annex, pNumber }) => {
    const isColly = !!annex.isColly;
    const aPath = annexurePath(annex.id);
    const title = `${annexLabel(pNumber, annex)}: ${annexureDetails(annex)}`;

    if (isColly) {
      const constituents = annex.collyDocuments || [];
      const hasAny = constituents.some((c: any) => hasUsableFile(c));
      annexureItems.push({
        id: `annex:${annex.id}`,
        label: title,
        sNo: sNoCounter++,
        particulars: (
          <div>
            <span className="font-medium">{title}</span>
            <div className="mt-1 space-y-1 pl-2 border-l">
              {constituents.length === 0 ? (
                <p className="text-[11px] italic text-amber-600 dark:text-amber-500">
                  No constituent documents added yet on List of Dates.
                </p>
              ) : (
                constituents.map((c: any, k: number) => {
                  const cPath = `${aPath}.collyDocuments.${k}`;
                  const cVal = form.watch(cPath as any);
                  const cHas = hasUsableFile(cVal);
                  return (
                    <div key={k} className="flex items-center justify-between text-[11px]">
                      <span>{c.title || `Document ${k + 1}`}</span>
                      <button
                        type="button"
                        onClick={() => handlePick(cPath, annex.id, k)}
                        className={`text-[10px] px-2 py-0.5 rounded border ${
                          cHas
                            ? "bg-green-500/10 text-green-700 border-green-500/40"
                            : "bg-red-500/10 text-red-600 border-red-500/40"
                        }`}
                      >
                        {cHas ? "Ready" : "Upload"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ),
        status: hasAny ? "user_uploaded" : "mandatory_missing",
        fileName: hasAny ? `${constituents.length} documents attached` : undefined,
        extra: <IssueList target={`annex:${annex.id}`} />,
      });
    } else {
      const val = aPath ? form.watch(aPath as any) : annex;
      const has = hasUsableFile(val);
      const fileName = val?.file?.name || fileNameOf(val?.filePath);

      annexureItems.push({
        id: `annex:${annex.id}`,
        label: title,
        sNo: sNoCounter++,
        particulars: title,
        status: has ? "user_uploaded" : "mandatory_missing",
        fileName,
        onUpload: aPath ? () => handlePick(aPath, annex.id) : undefined,
        extra: <IssueList target={`annex:${annex.id}`} />,
      });
    }
  });

  // 3. TAIL
  const tailItems: PaperbookItem[] = [];
  const cms = open ? wpActiveCms(project as DraftoProject) : [];
  const year = new Date().getFullYear();

  const cmAffidavitPath = (key: string) => {
    if (!key.startsWith("custom:")) return `wp.cms.${key}.signedAffidavit`;
    const id = key.slice("custom:".length);
    const idx = (project.wp?.customCms || []).findIndex((c: any) => c.id === id);
    return idx >= 0 ? `wp.customCms.${idx}.signedAffidavit` : "";
  };

  cms.forEach((cm, i) => {
    const affPath = cmAffidavitPath(cm.key);
    const affVal = affPath ? form.watch(affPath as any) : null;
    const hasAff = hasUsableFile(affVal);
    const affFileName = affVal?.file?.name || fileNameOf(affVal?.filePath);

    tailItems.push({
      id: `cm:${i}`,
      label: `${wpCmTitle(cm)} — Affidavit`,
      sNo: sNoCounter++,
      particulars: (
        <div>
          <span className="font-medium">
            C.M. No. ____ of {year}: {wpCmTitle(cm)}, with affidavit.
          </span>
          <p className="text-[11px] text-muted-foreground">
            Application auto-generated. Signed affidavit required.
          </p>
        </div>
      ),
      status: hasAff ? "user_uploaded" : "mandatory_missing",
      fileName: affFileName,
      onUpload: affPath ? () => handlePick(affPath) : undefined,
      onRemove: hasAff && affPath ? () => handleClear(affPath) : undefined,
      extra: (
        <>
          <IssueList target={`cm:${i}`} />
          <IssueList target={`customcm:${cm.key.replace(/^custom:/, "")}`} />
        </>
      ),
    });
  });

  // Vakalatnama
  const vakVal = form.watch("wp.uploads.signedVakalatnama" as any);
  const hasVak = hasUsableFile(vakVal);
  const vakFileName = vakVal?.file?.name || fileNameOf(vakVal?.filePath);

  tailItems.push({
    id: "vakalatnama",
    label: "Vakalatnama",
    sNo: sNoCounter++,
    particulars: (
      <div>
        <span className="font-medium">Vakalatnama</span>
        <p className="text-[11px] text-muted-foreground">
          Signed copy required.
        </p>
      </div>
    ),
    status: hasVak ? "user_uploaded" : "mandatory_missing",
    fileName: vakFileName,
    onUpload: () => handlePick("wp.uploads.signedVakalatnama"),
    onRemove: hasVak ? () => handleClear("wp.uploads.signedVakalatnama") : undefined,
    extra: <IssueList target="vakalatnama" />,
  });

  // Court Fee
  const courtFeeVal = form.watch("wp.uploads.courtFee" as any);
  const hasCourtFee = hasUsableFile(courtFeeVal);
  const courtFeeFileName = courtFeeVal?.file?.name || fileNameOf(courtFeeVal?.filePath);

  tailItems.push({
    id: "courtFee",
    label: "Court Fee (e-Court Fee receipt)",
    sNo: sNoCounter++,
    particulars: "Court Fee (e-Court Fee receipt)",
    status: hasCourtFee ? "user_uploaded" : "mandatory_missing",
    fileName: courtFeeFileName,
    onUpload: () => handlePick("wp.uploads.courtFee"),
    onRemove: hasCourtFee ? () => handleClear("wp.uploads.courtFee") : undefined,
    extra: <IssueList target="courtFee" />,
  });

  // Proof of Service
  const serviceVal = form.watch("wp.uploads.proofOfService" as any);
  const hasService = hasUsableFile(serviceVal);
  const serviceFileName = serviceVal?.file?.name || fileNameOf(serviceVal?.filePath);

  tailItems.push({
    id: "proofOfService",
    label: "Proof of Service (Advance-service email / acknowledgement)",
    sNo: sNoCounter++,
    particulars: "Proof of Service (Advance-service email / acknowledgement)",
    status: hasService ? "user_uploaded" : "mandatory_missing",
    fileName: serviceFileName,
    onUpload: () => handlePick("wp.uploads.proofOfService"),
    onRemove: hasService ? () => handleClear("wp.uploads.proofOfService") : undefined,
    extra: <IssueList target="proofOfService" />,
  });

  const missingMandatoryLabels: string[] = [];
  [...initialItems, ...annexureItems, ...tailItems].forEach((it) => {
    if (it.status === "mandatory_missing") {
      missingMandatoryLabels.push(
        it.label || (typeof it.particulars === "string" ? it.particulars : `S. No. ${it.sNo}`)
      );
    }
  });

  const customOptions = (
    <div className="space-y-1 pb-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Front matter order
      </p>
      <div className="flex flex-wrap gap-1.5">
        {order.map((k, i) => (
          <div
            key={k}
            className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs bg-muted/20"
          >
            <span>
              {i + 1}. {FRONT_LABELS[k]}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-5 w-5"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-5 w-5"
              disabled={i === order.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );

  const handleGo = async () => {
    setIsGenerating(true);
    setProgressLabel("Starting…");
    cancelledRef.current = false;
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    try {
      const result = await generateWpPdf(
        form.getValues(),
        (label) => setProgressLabel(label),
        signal
      );

      if (cancelledRef.current || signal.aborted) return;

      if (!result.success || !result.pdfBase64) {
        toast({
          variant: "destructive",
          title: "PDF Failed",
          description: result.error || "Could not assemble the PDF.",
        });
        return;
      }

      let finalPdf = result.pdfBase64;
      if (ocr && window.electron?.processOcr) {
        setIsGenerating(false);
        setIsProcessingOcr(true);
        try {
          const ocrRes = await window.electron.processOcr(finalPdf);
          if (cancelledRef.current) return;
          if (ocrRes.success && ocrRes.pdf) {
            finalPdf = ocrRes.pdf;
          } else if (ocrRes.error !== "cancelled") {
            throw new Error(ocrRes.error || "OCR failed");
          }
        } catch (e: any) {
          if (cancelledRef.current) return;
          toast({
            variant: "destructive",
            title: "OCR Failed",
            description: `${e?.message || e} — saving original PDF.`,
          });
        } finally {
          setIsProcessingOcr(false);
        }
      }

      if (cancelledRef.current) return;

      const settings = getSettings();
      let saved = false;
      try {
        if (typeof window !== "undefined" && window.electron?.savePdf) {
          const savedPath = await window.electron.savePdf({
            fileName: result.fileName,
            content: finalPdf,
            defaultPath: (settings as any).defaultPdfPath || undefined,
          });
          if (savedPath) {
            saved = true;
            toast({ title: "PDF Saved", description: savedPath });
            window.electron.revealFilePath?.(savedPath);
          }
        }
      } catch {
        /* fallback to browser download */
      }

      if (!saved) {
        const bytes = Uint8Array.from(atob(finalPdf), (c) => c.charCodeAt(0));
        saveAs(new Blob([bytes], { type: "application/pdf" }), result.fileName);
      }

      incrementGenerationCount("paperbook");
      window.dispatchEvent(
        new CustomEvent("drafto-offer-briefing", {
          detail: { pageByAnnexId: result.annexureFirstPages || {} },
        })
      );
      setOpen(false);
    } catch (err: any) {
      if (cancelledRef.current || err?.name === "AbortError") return;
      toast({
        variant: "destructive",
        title: "PDF Generation Failed",
        description: err?.message || String(err),
      });
    } finally {
      setIsGenerating(false);
      setIsProcessingOcr(false);
    }
  };

  const handleBack = () => {
    cancelledRef.current = true;
    abortControllerRef.current?.abort();
    window.electron?.cancelOcr?.();
    setIsGenerating(false);
    setIsProcessingOcr(false);
    setOpen(false);
  };

  return (
    <PaperbookGeneratorView
      open={open}
      onOpenChange={setOpen}
      title="Paperbook Generator"
      description="Assemble the Writ Petition paperbook. Upload filing documents and any signed/executed copies."
      sections={{
        initial: initialItems,
        annexures: annexureItems,
        tail: tailItems,
      }}
      customOptions={customOptions}
      ocr={{
        checked: ocr,
        onChange: setOcr,
        disabled: isGenerating || isProcessingOcr,
      }}
      isGenerating={isGenerating}
      progressPercent={progress}
      progressLabel={progressLabel}
      isProcessingOcr={isProcessingOcr}
      canExport={canExport}
      exportPermissionMessage={
        !canExport ? (
          <p>
            {permission.reason === "court"
              ? "Writ Petitions are not included in your plan, so this paper-book cannot be generated. "
              : "Paperbook generation is disabled because your subscription isn’t active. "}
            <button
              type="button"
              className="underline"
              onClick={openManageSubscription}
            >
              {permission.reason === "court" ? "Upgrade" : "Renew"}
            </button>{" "}
            to continue.
          </p>
        ) : undefined
      }
      onBack={handleBack}
      onGo={handleGo}
      missingMandatoryLabels={missingMandatoryLabels}
    >
      {children}
    </PaperbookGeneratorView>
  );
}
