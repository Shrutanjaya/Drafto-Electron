
"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { DraftoProject, Annexure } from "@/lib/schema";
import { customIaSchema } from "@/lib/schema";
import { useCalculatedValues } from "@/hooks/use-calculated-values";
import { Checkbox } from "../ui/checkbox";
import { useEffect, useMemo, useRef, useState } from "react";
import { IaGroundTable } from "../custom/ia-ground-table";
import { Button } from "../ui/button";
import { PlusCircle, Info, Paperclip, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Textarea } from "../ui/textarea";
import { AamTable } from "../custom/aam-table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { standardIaList } from "@/lib/ia-list";
import { DateInput } from "../custom/date-input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";
import { pickFile } from "@/lib/utils/pick-file";
import { format } from "date-fns";
import { annexurePrefix, isAppeal } from "@/lib/court-family";
import {
  getIaCommonOpening,
  IA_COMMON_CLOSING,
  IA_PRAYER_LEAD,
  IA_PRAYER_TAIL,
  getIaLeadIn,
  getIaPrayer,
  buildImpugnedOrderText,
  CUSTOM_IA_PARA2_LEAD,
  type IaPreviewOpts,
} from "@/lib/ia-preview";

// ─── Read-only "standard text" preview ───────────────────────────────────────
// Renders the auto-inserted document paragraphs in gray, prefixed with their
// serial number (1., 2., …) to mirror the generated document. No heading — the
// gray colour distinguishes it from the editable fields around it.
const STD_TEXT = "text-xs leading-relaxed text-neutral-500 dark:text-neutral-400";

function StandardBlock({ startNum, paras }: { startNum?: number; paras: string[] }) {
  const items = paras.filter(p => p && p.trim() !== "");
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {items.map((p, i) => (
        <p key={i} className={STD_TEXT}>
          {startNum != null && <span className="font-medium mr-1">{startNum + i}.</span>}
          {p}
        </p>
      ))}
    </div>
  );
}

// The prayer paragraph (numbered) with its lettered sub-prayers a., b.
function StandardPrayerBlock({ id, num, opts }: { id: string; num?: number; opts?: IaPreviewOpts }) {
  const prayer = getIaPrayer(id, opts);
  return (
    <div className="space-y-1">
      <p className={STD_TEXT}>
        {num != null && <span className="font-medium mr-1">{num}.</span>}
        {IA_PRAYER_LEAD}
      </p>
      <ol className="list-[lower-alpha] pl-6 space-y-0.5">
        {prayer && <li className={STD_TEXT}>{prayer}</li>}
        <li className={STD_TEXT}>{IA_PRAYER_TAIL}</li>
      </ol>
    </div>
  );
}

// ─── Left-panel section header ────────────────────────────────────────────────
function NavSection({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-1 px-1 pt-2.5 pb-0.5 first:pt-0">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">{label}</span>
      {hint && (
        <Tooltip>
          <TooltipTrigger type="button"><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
          <TooltipContent><p className="max-w-xs text-xs">{hint}</p></TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

// ─── Left-panel IA row ────────────────────────────────────────────────────────
function IaListRow({
  label,
  active,
  selected,
  onClick,
}: {
  label: string;
  active: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2",
        selected
          ? "bg-primary text-primary-foreground dark:text-white"
          : "hover:bg-muted text-foreground"
      )}
    >
      <span className={cn(
        "h-2 w-2 rounded-full flex-shrink-0",
        active
          ? selected ? "bg-green-300" : "bg-green-500"
          : selected ? "bg-primary-foreground/40" : "bg-muted-foreground/30"
      )} />
      <span className={cn("leading-snug", !active && !selected && "text-muted-foreground/60")}>{label}</span>
    </button>
  );
}

// ─── CC receipt uploader (extracted to avoid hooks-in-render violation) ───────
function CcReceiptField({ control }: { control: any }) {
  const receiptInputRef = useRef<HTMLInputElement>(null);
  return (
    <FormField
      control={control}
      name="standardIas.exemptionCertifiedCopy.receiptFile"
      render={({ field }) => {
        const hasReceiptFile = field.value instanceof File;
        const handleReceiptClick = async () => {
          if (typeof window !== 'undefined' && (window as any).electron?.openFileDialog) {
            const file = await pickFile();
            if (file) field.onChange(file);
          } else {
            receiptInputRef.current?.click();
          }
        };
        return (
          <FormItem>
            <FormControl>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleReceiptClick}
                    className={cn("p-1 rounded-md hover:bg-muted", hasReceiptFile && "text-accent")}
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{hasReceiptFile ? (field.value as File).name : 'Upload Receipt'}</p>
                </TooltipContent>
              </Tooltip>
            </FormControl>
            <Input
              type="file"
              accept=".pdf"
              ref={receiptInputRef}
              className="hidden"
              onChange={(e) => field.onChange(e.target.files?.[0])}
            />
          </FormItem>
        );
      }}
    />
  );
}

// ─── Custom IA left-pane row ─────────────────────────────────────────────────
function CustomIaListRow({
  index,
  selected,
  onClick,
  onRemove,
}: {
  index: number;
  selected: boolean;
  onClick: () => void;
  onRemove: () => void;
}) {
  const form = useFormContext<DraftoProject>();
  const title = useWatch({ control: form.control, name: `customIas.${index}.title` });
  return (
    <div className={cn(
      "flex items-center gap-1 rounded-md text-xs transition-colors group",
      selected ? "bg-primary text-primary-foreground dark:text-white" : "hover:bg-muted text-foreground"
    )}>
      <button type="button" onClick={onClick} className="flex items-center gap-2 flex-1 min-w-0 px-2 py-1.5">
        <span className={cn(
          "h-2 w-2 rounded-full flex-shrink-0",
          selected ? "bg-green-300" : "bg-green-500"
        )} />
        <span className="leading-snug truncate">{title || "Untitled IA"}</span>
      </button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex-shrink-0 pr-2 opacity-0 group-hover:opacity-100 transition-opacity",
              selected ? "opacity-100 text-primary-foreground/70 dark:text-white/70 hover:text-white" : "text-muted-foreground hover:text-destructive"
            )}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this custom IA?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onRemove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function IasTab() {
  const form = useFormContext<DraftoProject>();
  const { delay } = useCalculatedValues();

  const { fields: customIaFields, append: appendCustomIa, remove: removeCustomIa } = useFieldArray({
    control: form.control,
    name: "customIas",
  });

  const caseType = useWatch({ control: form.control, name: "caseType" });
  const listOfDates = useWatch({ control: form.control, name: 'listOfDates' });
  const impugnedOrders = useWatch({ control: form.control, name: 'impugnedOrders' });
  // Previews here must show the same annexure letter the documents will carry:
  // A-series for a statutory appeal, P-series everywhere else.
  const iasCourtType = useWatch({ control: form.control, name: 'courtType' });
  const annexPrefix = annexurePrefix(iasCourtType);
  const hasAppliedForCC = useWatch({ control: form.control, name: "standardIas.exemptionCertifiedCopy.hasApplied" });
  const ccReceiptDate = useWatch({ control: form.control, name: "standardIas.exemptionCertifiedCopy.receiptDate" });
  const ccReason = useWatch({ control: form.control, name: "standardIas.exemptionCertifiedCopy.reasonForNotApplying" });
  const delayActive = useWatch({ control: form.control, name: "standardIas.condonationOfDelay.active" });
  const ccActive = useWatch({ control: form.control, name: "standardIas.exemptionCertifiedCopy.active" });
  const surrenderActive = useWatch({ control: form.control, name: "standardIas.exemptionFromSurrendering.active" });
  const otActive = useWatch({ control: form.control, name: "standardIas.exemptionOfficialTranslation.active" });
  const adActive = useWatch({ control: form.control, name: "standardIas.additionalDocuments" });
  const otReason = useWatch({ control: form.control, name: "standardIas.exemptionOfficialTranslation.reason" });
  const otUserReason = useWatch({ control: form.control, name: "standardIas.exemptionOfficialTranslation.userReason" });
  const delayGrounds = useWatch({ control: form.control, name: "standardIas.condonationOfDelay.grounds" });
  const adGrounds = useWatch({ control: form.control, name: "standardIas.additionalDocumentsGrounds" });

  const isCriminal = caseType === "Criminal";
  const isAppealProject = isAppeal(iasCourtType);
  // Previews name the document they accompany, matching the generator.
  const iaDocLong = isAppealProject ? "Appeal" : "Special Leave Petition";
  const suspensionActive = useWatch({ control: form.control, name: "standardIas.suspensionOfSentence.active" });

  // Delay IA is "ready" (green) only once the user has supplied at least one
  // non-blank ground. AD/OT grounds are optional, so those stay green when active.
  const delayHasGround = (delayGrounds || []).some((g: any) => (g?.particulars || "").trim() !== "");
  // Number of AD grounds rows — each is numbered (para 3, 4, 5…) after the
  // lead-in, shifting the closing paragraphs' serial numbers in the preview.
  // Counts every row (not just non-blank) so the gray paras below stay in sync
  // with the row labels in the grounds table as the user adds/removes rows.
  const adGroundsCount = (adGrounds || []).length;

  // Titles by id from the canonical list.
  const titleFor = (id: string) => standardIaList.find(s => s.id === id)?.title || "";

  const [selectedId, setSelectedId] = useState<string>("delay");

  // Auto-select newly appended custom IA
  const prevCustomIaCountRef = useRef(customIaFields.length);
  useEffect(() => {
    if (customIaFields.length > prevCustomIaCountRef.current && customIaFields.length > 0) {
      setSelectedId(customIaFields[customIaFields.length - 1].id);
    }
    prevCustomIaCountRef.current = customIaFields.length;
  }, [customIaFields]);

  const handleRemoveCustomIa = (index: number) => {
    const fieldId = customIaFields[index].id;
    if (selectedId === fieldId) setSelectedId("delay");
    removeCustomIa(index);
  };

  // Keep selection valid when a row disappears: Surrender (Civil) or Official
  // Translation (no translated annexures).
  useEffect(() => {
    if (!isCriminal && selectedId === "surrender") setSelectedId("delay");
    if (!(isAppealProject && isCriminal) && selectedId === "susp") setSelectedId("delay");
    if (!otActive && selectedId === "ot") setSelectedId("delay");
  }, [isCriminal, otActive, selectedId, isAppealProject]);

  // Auto-sync active flags from computed values
  useEffect(() => {
    const shouldBeActive = delay > 0;
    if (shouldBeActive !== form.getValues("standardIas.condonationOfDelay.active")) {
      form.setValue("standardIas.condonationOfDelay.active", shouldBeActive);
    }
  }, [delay, form]);

  useEffect(() => {
    if (delay > 0) {
      const current = form.getValues("standardIas.condonationOfDelay.delayDays");
      if (delay !== current) form.setValue("standardIas.condonationOfDelay.delayDays", delay);
    }
  }, [delay, form]);

  useEffect(() => {
    const hasTranslated = (listOfDates || []).some(lod =>
      (lod.annexures || []).some(a => a.copyType === 'translated copy' || a.copyType === 'true and translated copy')
    );
    if (hasTranslated !== form.getValues("standardIas.exemptionOfficialTranslation.active")) {
      form.setValue("standardIas.exemptionOfficialTranslation.active", hasTranslated);
    }
  }, [listOfDates, form]);

  useEffect(() => {
    const hasAdditional = (listOfDates || []).some(lod =>
      (lod.annexures || []).some(a => a.isAdditionalDocument)
    );
    if (hasAdditional !== form.getValues("standardIas.additionalDocuments")) {
      form.setValue("standardIas.additionalDocuments", hasAdditional);
    }
  }, [listOfDates, form]);

  const annexureNumberingMap = useMemo(() => {
    const map = new Map<string, number>();
    const allAnnexures: Annexure[] = (listOfDates || []).flatMap(lod => lod.annexures || []);
    const nonAd = allAnnexures.filter(a => !a.isAdditionalDocument);
    const ad = allAnnexures.filter(a => a.isAdditionalDocument);
    let counter = 1;
    nonAd.forEach(a => map.set(a.id, counter++));
    ad.forEach(a => map.set(a.id, counter++));
    return map;
  }, [listOfDates]);

  useEffect(() => {
    const allAnnexures: Annexure[] = (listOfDates || []).flatMap(lod => lod.annexures || []);
    const translated = allAnnexures
      .filter(a => a.copyType === 'translated copy' || a.copyType === 'true and translated copy')
      .map(a => annexureNumberingMap.get(a.id))
      .filter(Boolean)
      .map(n => `${annexPrefix}-${n}`);
    let newReason = '';
    if (translated.length > 0) {
      const last = translated.pop();
      newReason = translated.length > 0 ? `Annexures ${translated.join(', ')} and ${last}` : `Annexure ${last}`;
    }
    if (newReason !== form.getValues('standardIas.exemptionOfficialTranslation.reason')) {
      form.setValue('standardIas.exemptionOfficialTranslation.reason', newReason);
    }
  }, [listOfDates, annexureNumberingMap, form]);

  // AD count + range for previews
  const adCount = useMemo(() =>
    (listOfDates || []).flatMap(lod => lod.annexures || []).filter(a => a.isAdditionalDocument).length,
  [listOfDates]);

  const adRange = useMemo(() => {
    const nums = (listOfDates || []).flatMap(lod => lod.annexures || [])
      .filter(a => a.isAdditionalDocument)
      .map(a => annexureNumberingMap.get(a.id))
      .filter((n): n is number => typeof n === "number")
      .sort((a, b) => a - b);
    if (nums.length === 0) return "";
    return nums.length === 1 ? `Annexure ${annexPrefix}-${nums[0]}` : `Annexures ${annexPrefix}-${nums[0]} to ${annexPrefix}-${nums[nums.length - 1]}`;
  }, [listOfDates, annexureNumberingMap]);

  // Extracted impugned-order text, mirrored from the docx, so Para 1 and the
  // prayer clauses show the real order details rather than "the Impugned Order(s)".
  const ioText = useMemo(() => buildImpugnedOrderText(impugnedOrders as any), [impugnedOrders]);

  // The Additional Documents annexure list, built exactly as the docx renders it,
  // so the preview shows the live list (gray) instead of a placeholder sentence.
  const adAnnexureEntries = useMemo(() => {
    const allAnnexures: Annexure[] = (listOfDates || []).flatMap(lod => lod.annexures || []);
    return allAnnexures
      .filter(a => a.isAdditionalDocument)
      .map(a => {
        const pNumber = annexureNumberingMap.get(a.id);
        let t = `Annexure ${annexPrefix}-${pNumber ?? "_"} (pp.___ to ___) is a ${a.copyType || "[description]"} of`;
        if (a.title) t += ` ${a.title}`;
        if (a.date) t += ` dated ${a.date}`;
        if ((a as any).customText) t += ` ${(a as any).customText}`;
        return t.trimEnd().match(/[.!?]$/) ? t.trimEnd() : t.trimEnd() + ".";
      });
  }, [listOfDates, annexureNumberingMap]);

  const ccReceiptDateStr = ccReceiptDate ? format(new Date(ccReceiptDate as any), "dd.MM.yyyy") : "";
  const ccOpts: IaPreviewOpts = { ccApplied: hasAppliedForCC as any, ccReceiptDate: ccReceiptDateStr, ccReason: ccReason as string, io: ioText };

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col">
        <ResizablePanelGroup direction="horizontal" className="rounded-lg border flex-1 min-h-[420px]" autoSaveId="ias-tab-panels">
          {/* Left: classified IA nav */}
          <ResizablePanel defaultSize={32} minSize={24}>
            <div className="flex flex-col h-full overflow-auto p-2 gap-0.5">

              {/* One list, split by whether the application is actually going
                  into the paper-book. Grouping by kind (configurable / auto /
                  custom) put one or two rows under each heading, which meant a
                  glance told you nothing about what you were actually filing. */}
              {(() => {
                const rows = [
                  { id: "cc", label: "Exemption (Certified Copy)", included: !!ccActive, show: true },
                  { id: "surrender", label: "Exemption (Surrender)", included: !!surrenderActive, show: isCriminal },
                  { id: "susp", label: "Suspension of Sentence", included: !!suspensionActive, show: isAppealProject && isCriminal },
                  { id: "delay", label: "Condonation of Delay", included: delay > 0, show: true },
                  { id: "ot", label: "Exemption (Official Translation)", included: true, show: !!otActive },
                  { id: "ad", label: "Additional Documents", included: !!adActive, show: true },
                ].filter((r) => r.show);
                const included = rows.filter((r) => r.included);
                const excluded = rows.filter((r) => !r.included);
                return (
                  <>
                    <NavSection label="Included" hint="These are going into the paper-book. Custom IAs are included as soon as you add one." />
                    {included.map((r) => (
                      <IaListRow key={r.id} label={r.label} active selected={selectedId === r.id} onClick={() => setSelectedId(r.id)} />
                    ))}
                    {customIaFields.map((field, index) => (
                      <CustomIaListRow
                        key={field.id}
                        index={index}
                        selected={selectedId === field.id}
                        onClick={() => setSelectedId(field.id)}
                        onRemove={() => handleRemoveCustomIa(index)}
                      />
                    ))}
                    {included.length === 0 && customIaFields.length === 0 && (
                      <p className="px-2 py-1 text-[11px] italic text-muted-foreground">None yet.</p>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => appendCustomIa(customIaSchema.parse({}))}
                    >
                      <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Add Custom IA
                    </Button>

                    {excluded.length > 0 && (
                      // Held at the foot of the panel, under a rule: what is
                      // being filed reads as one list, and what is not sits
                      // apart from it rather than trailing off the end of it.
                      <div className="mt-auto flex flex-col gap-0.5 border-t pt-2">
                        <NavSection label="Not included" hint="Open one and tick Include — or, for the automatic ones, they appear here until their trigger fires." />
                        {excluded.map((r) => (
                          <IaListRow key={r.id} label={r.label} active={false} selected={selectedId === r.id} onClick={() => setSelectedId(r.id)} />
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: detail panel */}
          <ResizablePanel defaultSize={68} minSize={45}>
            <div className="h-full overflow-auto p-3">

              {/* ── Condonation of Delay (Mandatory / Auto) ── */}
              {selectedId === "delay" && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">{`Application for condonation of delay of ${delay > 0 ? delay : "__"} days in filing the ${isAppealProject ? "Appeal" : "SLP"}`}</h4>
                  {delay <= 0 && (
                    <p className="text-xs text-muted-foreground italic">Since there is no delay, this IA won't be included.</p>
                  )}
                  <StandardBlock startNum={1} paras={[getIaCommonOpening(ioText, iaDocLong), getIaLeadIn("condonationOfDelay", { delayDays: delay > 0 ? delay : "__" })]} />
                  <IaGroundTable name="standardIas.condonationOfDelay.grounds" />
                  <StandardBlock startNum={3} paras={IA_COMMON_CLOSING} />
                  <StandardPrayerBlock id="condonationOfDelay" num={5} opts={{ delayDays: delay > 0 ? delay : "__", io: ioText, docNoun: isAppealProject ? "Appeal" : "SLP" }} />
                </div>
              )}

              {/* ── Exemption (Certified Copy) — Configurable ── */}
              {selectedId === "cc" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">{titleFor("exemptionCertifiedCopy")}</h4>
                    <FormField
                      control={form.control}
                      name="standardIas.exemptionCertifiedCopy.active"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-1.5 space-y-0">
                          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} id="cc-active" /></FormControl>
                          <FormLabel htmlFor="cc-active" className="text-xs font-normal cursor-pointer">Include</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <FormField
                      control={form.control}
                      name="standardIas.exemptionCertifiedCopy.hasApplied"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Have you applied for the Certified Copy?</FormLabel>
                          <FormControl>
                            <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4 mt-1">
                              <FormItem className="flex items-center space-x-1.5 space-y-0">
                                <FormControl><RadioGroupItem value="yes" /></FormControl>
                                <FormLabel className="font-normal text-xs cursor-pointer">Yes</FormLabel>
                              </FormItem>
                              <FormItem className="flex items-center space-x-1.5 space-y-0">
                                <FormControl><RadioGroupItem value="no" /></FormControl>
                                <FormLabel className="font-normal text-xs cursor-pointer">No</FormLabel>
                              </FormItem>
                            </RadioGroup>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    {hasAppliedForCC === 'yes' && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <CcReceiptField control={form.control} />
                        <FormField
                          control={form.control}
                          name="standardIas.exemptionCertifiedCopy.receiptDate"
                          render={({ field }) => (
                            <FormItem className="flex items-center gap-2">
                              <FormLabel className="text-xs">Receipt dated</FormLabel>
                              <FormControl><DateInput value={field.value} onChange={field.onChange} /></FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                    {hasAppliedForCC === 'no' && (
                      <FormField
                        control={form.control}
                        name="standardIas.exemptionCertifiedCopy.reasonForNotApplying"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl><Textarea {...field} className="text-xs" placeholder="Please enter reason for not applying. This will be inserted in Para 2 of the Application (see live preview below)." /></FormControl>
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                  <StandardBlock startNum={1} paras={[getIaCommonOpening(ioText, iaDocLong)]} />
                  <StandardBlock startNum={2} paras={[getIaLeadIn("exemptionCertifiedCopy", ccOpts)]} />
                  <StandardBlock startNum={3} paras={IA_COMMON_CLOSING} />
                  <StandardPrayerBlock id="exemptionCertifiedCopy" num={5} opts={{ io: ioText }} />
                </div>
              )}

              {/* ── Exemption from Surrendering — Configurable (Criminal only) ── */}
              {selectedId === "surrender" && isCriminal && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">{titleFor("exemptionFromSurrendering")}</h4>
                    <FormField
                      control={form.control}
                      name="standardIas.exemptionFromSurrendering.active"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-1.5 space-y-0">
                          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} id="surr-active" /></FormControl>
                          <FormLabel htmlFor="surr-active" className="text-xs font-normal cursor-pointer">Include</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                  <StandardBlock startNum={1} paras={[getIaCommonOpening(ioText, iaDocLong), getIaLeadIn("exemptionFromSurrendering", { io: ioText })]} />
                  <IaGroundTable name="standardIas.exemptionFromSurrendering.grounds" />
                  <StandardBlock startNum={3} paras={IA_COMMON_CLOSING} />
                  <StandardPrayerBlock id="exemptionFromSurrendering" num={5} opts={{ io: ioText }} />
                </div>
              )}

              {/* ── Suspension of Sentence — criminal appeals only ── */}
              {selectedId === "susp" && isAppealProject && isCriminal && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">{titleFor("suspensionOfSentence")}</h4>
                    <FormField
                      control={form.control}
                      name="standardIas.suspensionOfSentence.active"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-1.5 space-y-0">
                          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} id="susp-active" /></FormControl>
                          <FormLabel htmlFor="susp-active" className="text-xs font-normal cursor-pointer">Include</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                  <StandardBlock startNum={1} paras={[getIaCommonOpening(ioText, iaDocLong), getIaLeadIn("suspensionOfSentence", { io: ioText })]} />
                  <IaGroundTable name="standardIas.suspensionOfSentence.grounds" />
                  <StandardBlock startNum={3} paras={IA_COMMON_CLOSING} />
                  <StandardPrayerBlock id="suspensionOfSentence" num={5} opts={{ io: ioText }} />
                </div>
              )}

              {/* ── Official Translation — Mandatory / Auto (optional reason) ── */}
              {selectedId === "ot" && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">{`Application for exemption from filing Official Translation(s) of ${otReason || "the annexures"}`}</h4>
                  <StandardBlock startNum={1} paras={[getIaCommonOpening(ioText, iaDocLong)]} />
                  <FormField
                    control={form.control}
                    name="standardIas.exemptionOfficialTranslation.userReason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Reason for not obtaining Official Translation(s) <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                        <FormControl><Textarea {...field} className="text-xs" placeholder="e.g. in view of the urgency involved..." /></FormControl>
                      </FormItem>
                    )}
                  />
                  <StandardBlock startNum={2} paras={[getIaLeadIn("exemptionOfficialTranslation", { annexureList: otReason as string, otUserReason: otUserReason as string })]} />
                  <StandardBlock startNum={3} paras={IA_COMMON_CLOSING} />
                  <StandardPrayerBlock id="exemptionOfficialTranslation" num={5} opts={{ annexureList: otReason as string }} />
                </div>
              )}

              {/* ── Additional Documents — Mandatory / Auto (grounds editable) ── */}
              {selectedId === "ad" && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">{titleFor("additionalDocuments")}</h4>
                  <p className="text-xs text-muted-foreground italic">
                    {adActive
                      ? `Auto-included because ${adCount} document${adCount !== 1 ? "s are" : " is"} marked as Additional Document(s) in the List of Dates.`
                      : "This IA is included automatically only when an annexure is marked as an Additional Document (AD). None are at present, so it won't be included."}
                  </p>
                  <StandardBlock startNum={1} paras={[getIaCommonOpening(ioText, iaDocLong), getIaLeadIn("additionalDocuments")]} />
                  {/* Live list of additional documents (lettered, gray) — exactly what the docx inserts here. */}
                  <div className="pl-4 space-y-1">
                    {adAnnexureEntries.length > 0 ? (
                      adAnnexureEntries.map((t, i) => (
                        <p key={i} className={STD_TEXT}>
                          <span className="font-medium mr-1">{String.fromCharCode(65 + i)}.</span>{t}
                        </p>
                      ))
                    ) : (
                      <p className={cn(STD_TEXT, "italic")}>The list of additional documents will appear here once annexures are marked as Additional Document(s) in the List of Dates.</p>
                    )}
                  </div>
                  <AamTable name="standardIas.additionalDocumentsGrounds" defaultRows={3} labelMode="numeric" numericStart={3} />
                  <StandardBlock startNum={3 + adGroundsCount} paras={IA_COMMON_CLOSING} />
                  <StandardPrayerBlock id="additionalDocuments" num={5 + adGroundsCount} opts={{ adRange }} />
                </div>
              )}

              {/* ── Custom IAs ── */}
              {customIaFields.map((field, index) => selectedId === field.id && (
                <div key={field.id} className="space-y-3">
                  <FormField
                    control={form.control}
                    name={`customIas.${index}.title`}
                    render={({ field: tf }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            {...tf}
                            className="text-sm font-semibold border-0 border-b rounded-none bg-transparent focus-visible:ring-0 px-0 h-auto"
                            placeholder="Application for..."
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <StandardBlock startNum={1} paras={[getIaCommonOpening(ioText, iaDocLong)]} />
                  {/* Para 2: fixed lead sentence + user-fillable text (reproduced verbatim in the docx). */}
                  <div className="space-y-1">
                    <p className={STD_TEXT}>
                      <span className="font-medium mr-1">2.</span>{CUSTOM_IA_PARA2_LEAD}
                    </p>
                    <FormField
                      control={form.control}
                      name={`customIas.${index}.para2`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea {...field} className="text-xs" placeholder="…continue the sentence (e.g. for seeking permission to …)" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <StandardBlock startNum={3} paras={[getIaLeadIn("custom")]} />
                  <IaGroundTable name={`customIas.${index}.grounds`} />
                  <StandardBlock startNum={4} paras={IA_COMMON_CLOSING} />
                  <StandardBlock startNum={6} paras={[IA_PRAYER_LEAD]} />
                  <AamTable name={`customIas.${index}.prayers`} />
                </div>
              ))}

            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TooltipProvider>
  );
}
