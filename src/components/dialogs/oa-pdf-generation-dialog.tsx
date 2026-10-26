"use client";

import React, { useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import { pickFile } from "@/lib/utils/pick-file";
import type { DraftoProject } from "@/lib/schema";
import { wpAnnexureOrder } from "@/lib/wp/wp-annexures";
import { useExportPermission } from "@/providers/entitlement-provider";
import { hasUsableFile, fileNameOf } from "@/lib/file-availability";
import { annexureDetails } from "@/lib/annexure-details";
import {
  PaperbookGeneratorView,
  type PaperbookItem,
} from "./paperbook-generator-view";

/**
 * Pre-flight + upload slots for the CAT Original Application paper-book.
 * Uses the standardized PaperbookGeneratorView layout with Initial, Annexures, and Tail sections.
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
  const [ocr, setOcr] = useState(false);
  const permission = useExportPermission("OriginalApplicationCAT");
  const canExport = permission.allowed;

  useEffect(() => {
    const openFromAssistant = () => setOpen(true);
    window.addEventListener("drafto-open-paperbook", openFromAssistant);
    return () => window.removeEventListener("drafto-open-paperbook", openFromAssistant);
  }, []);

  const project = form.watch();

  const handlePick = async (path: string) => {
    const f = await pickFile();
    if (f) {
      form.setValue(`${path}.file` as any, f, { shouldDirty: true });
      form.setValue(`${path}.filePath` as any, (f as any).path);
    }
  };

  const handleClear = (path: string) => {
    form.setValue(`${path}.file` as any, undefined, { shouldDirty: true });
    form.setValue(`${path}.filePath` as any, undefined);
  };

  // Build the 3 sections matching buildOaIndex order exactly:
  // 1. Initial: Memo of Parties -> Synopsis and LoD -> PTs -> MAs -> OA (with Last Page)
  // 2. Annexures: Annexure A-1, A-2...
  // 3. Tail: Vakalatnama(s) -> Court Fee -> Proof of Service

  let sNoCounter = 1;

  // --- INITIAL ---
  const initialItems: PaperbookItem[] = [];

  // 1. Memo of Parties
  initialItems.push({
    id: "memo",
    sNo: sNoCounter++,
    particulars: "Memo of Parties",
    status: "auto_ready",
  });

  // 2. Synopsis and List of Dates
  initialItems.push({
    id: "synopsis",
    sNo: sNoCounter++,
    particulars: "Synopsis and List of Dates",
    status: "auto_frozen",
    lockedTooltip: "Synopsis and List of Dates contains auto-calculated references; cannot be replaced",
  });

  // 3. PTs and MAs
  const masList = (project.oa?.mas || []) as any[];
  const maKindLabel = (m: any) =>
    m.kind === "pt"
      ? "Petition for Transfer, with Affidavit"
      : m.kind === "delay"
      ? "Miscellaneous Application (Condonation of Delay), with Affidavit"
      : m.kind === "joinder"
      ? "Miscellaneous Application (Joinder of Applicants), with Affidavit"
      : m.kind === "exemptCopies"
      ? "Miscellaneous Application (Exemption — Copies), with Affidavit"
      : m.kind === "exemptTranslation"
      ? "Miscellaneous Application (Exemption — Translations), with Affidavit"
      : "Miscellaneous Application, with Affidavit";

  const orderedMas = [
    ...masList.filter((m) => m.kind === "pt"),
    ...masList.filter((m) => m.kind !== "pt"),
  ];

  orderedMas.forEach((m) => {
    const idx = masList.findIndex((x) => x.id === m.id);
    const path = `oa.mas.${idx}.signedAffidavit`;
    const affVal = form.watch(path as any);
    const hasAff = hasUsableFile(affVal);
    const fileName = affVal?.file?.name || fileNameOf(affVal?.filePath);

    initialItems.push({
      id: `ma_${m.id}`,
      sNo: sNoCounter++,
      particulars: (
        <div>
          <span className="font-medium">{maKindLabel(m)}</span>
          <p className="text-[11px] text-muted-foreground">
            Application auto-generated. Signed affidavit optional.
          </p>
        </div>
      ),
      status: hasAff ? "user_uploaded" : "optional_missing",
      fileName,
      onUpload: () => handlePick(path),
      onRemove: hasAff ? () => handleClear(path) : undefined,
    });
  });

  // 4. Original Application
  const lastPageVal = form.watch("oa.uploads.signedLastPage" as any);
  const hasLastPage = hasUsableFile(lastPageVal);
  const lastPageFileName = lastPageVal?.file?.name || fileNameOf(lastPageVal?.filePath);

  initialItems.push({
    id: "oa",
    sNo: sNoCounter++,
    particulars: (
      <div>
        <span className="font-medium">
          Original Application under Section 19 of the Administrative Tribunals Act, 1985
        </span>
        <p className="text-[11px] text-muted-foreground">
          Body auto-generated. Signed last page(s) optional.
        </p>
      </div>
    ),
    status: hasLastPage ? "user_uploaded" : "auto_ready",
    fileName: lastPageFileName,
    onUpload: () => handlePick("oa.uploads.signedLastPage"),
    onRemove: hasLastPage ? () => handleClear("oa.uploads.signedLastPage") : undefined,
  });

  // --- ANNEXURES ---
  const annexureItems: PaperbookItem[] = [];
  const orderedAnnexures = wpAnnexureOrder(project as DraftoProject);

  const annexureRows: any[] = (project as any).oa?.factsRows?.some((r: any) => (r.annexures || []).length)
    ? (project as any).oa.factsRows
    : project.listOfDates || [];
  const annexureBase = annexureRows === (project.listOfDates || []) ? "listOfDates" : "oa.factsRows";
  const findAnnexurePath = (annexId: string) => {
    for (let i = 0; i < annexureRows.length; i++) {
      const j = (annexureRows[i].annexures || []).findIndex((a: any) => a.id === annexId);
      if (j >= 0) return `${annexureBase}.${i}.annexures.${j}`;
    }
    return null;
  };

  orderedAnnexures.forEach((e) => {
    const path = findAnnexurePath(e.annex.id);
    const isColly = !!e.annex.isColly;
    const label = `Annexure A-${e.pNumber}${isColly ? " (Colly)" : ""}`;
    const copy = isColly ? "True copies of" : `A ${e.annex.copyType || "true copy"} of`;
    const dated = e.annex.date ? ` dated ${e.annex.date}` : "";
    const title = `${label}: ${copy} ${annexureDetails(e.annex) || e.annex.title || "[description]"}${dated}`;

    if (isColly) {
      const constituents = e.annex.collyDocuments || [];
      const hasAnyFile = constituents.some((c: any) => hasUsableFile(c));
      annexureItems.push({
        id: `annex_${e.annex.id}`,
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
                  const cPath = `${path}.collyDocuments.${k}`;
                  const cVal = form.watch(cPath as any);
                  const cHas = hasUsableFile(cVal);
                  return (
                    <div key={k} className="flex items-center justify-between text-[11px]">
                      <span>{c.title || `Document ${k + 1}`}</span>
                      <button
                        type="button"
                        onClick={() => handlePick(cPath)}
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
        status: hasAnyFile ? "user_uploaded" : "mandatory_missing",
        fileName: hasAnyFile ? `${constituents.length} documents attached` : undefined,
      });
    } else {
      const val = path ? form.watch(path as any) : e.annex;
      const has = hasUsableFile(val);
      const fileName = val?.file?.name || fileNameOf(val?.filePath);

      annexureItems.push({
        id: `annex_${e.annex.id}`,
        sNo: sNoCounter++,
        particulars: title,
        status: has ? "user_uploaded" : "mandatory_missing",
        fileName,
        onUpload: path ? () => handlePick(path) : undefined,
      });
    }
  });

  // --- TAIL ---
  const tailItems: PaperbookItem[] = [];

  // Vakalatnama
  const vakVal = form.watch("oa.uploads.signedVakalatnama" as any);
  const hasVak = hasUsableFile(vakVal);
  const vakFileName = vakVal?.file?.name || fileNameOf(vakVal?.filePath);

  tailItems.push({
    id: "vakalatnama",
    sNo: sNoCounter++,
    particulars: (
      <div>
        <span className="font-medium">Vakalatnama(s) and Authority Letter(s)</span>
        <p className="text-[11px] text-muted-foreground">
          Auto-generated clean copy is ready. Signed copy optional.
        </p>
      </div>
    ),
    status: hasVak ? "user_uploaded" : "auto_ready",
    fileName: vakFileName,
    onUpload: () => handlePick("oa.uploads.signedVakalatnama"),
    onRemove: hasVak ? () => handleClear("oa.uploads.signedVakalatnama") : undefined,
  });

  // Court Fee
  const courtFeeVal = form.watch("oa.uploads.courtFee" as any);
  const hasCourtFee = hasUsableFile(courtFeeVal);
  const courtFeeFileName = courtFeeVal?.file?.name || fileNameOf(courtFeeVal?.filePath);

  tailItems.push({
    id: "courtFee",
    sNo: sNoCounter++,
    particulars: "Court Fee (e-Court Fee receipt)",
    status: hasCourtFee ? "user_uploaded" : "mandatory_missing",
    fileName: courtFeeFileName,
    onUpload: () => handlePick("oa.uploads.courtFee"),
    onRemove: hasCourtFee ? () => handleClear("oa.uploads.courtFee") : undefined,
  });

  // Proof of Service
  const serviceVal = form.watch("oa.uploads.proofOfService" as any);
  const hasService = hasUsableFile(serviceVal);
  const serviceFileName = serviceVal?.file?.name || fileNameOf(serviceVal?.filePath);

  tailItems.push({
    id: "proofOfService",
    sNo: sNoCounter++,
    particulars: "Proof of Service (Advance-service acknowledgement)",
    status: hasService ? "user_uploaded" : "mandatory_missing",
    fileName: serviceFileName,
    onUpload: () => handlePick("oa.uploads.proofOfService"),
    onRemove: hasService ? () => handleClear("oa.uploads.proofOfService") : undefined,
  });

  const missingMandatoryLabels: string[] = [];
  [...initialItems, ...annexureItems, ...tailItems].forEach((it) => {
    if (it.status === "mandatory_missing") {
      missingMandatoryLabels.push(
        typeof it.particulars === "string" ? it.particulars : `S. No. ${it.sNo}`
      );
    }
  });

  return (
    <PaperbookGeneratorView
      open={open}
      onOpenChange={setOpen}
      title="Paperbook Generator"
      description="Assemble the Original Application paperbook. Upload filing documents and any signed/executed copies."
      sections={{
        initial: initialItems,
        annexures: annexureItems,
        tail: tailItems,
      }}
      ocr={{
        checked: ocr,
        onChange: setOcr,
        disabled: isPending,
      }}
      isGenerating={isPending}
      canExport={canExport}
      exportPermissionMessage={
        !canExport ? (
          <p>
            {permission.reason === "court"
              ? "Original Applications are not included in your plan, so this paper-book cannot be generated."
              : "Paperbook generation is disabled because your subscription isn’t active."}
          </p>
        ) : undefined
      }
      onBack={() => setOpen(false)}
      onGo={() => {
        onGenerate({ ocr });
        setOpen(false);
      }}
      missingMandatoryLabels={missingMandatoryLabels}
    >
      {children}
    </PaperbookGeneratorView>
  );
}
