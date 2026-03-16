
"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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

// ─── Auto-included pill ──────────────────────────────────────────────────────
function AutoPill({ label, active, detail }: { label: string; active: boolean; detail?: string }) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
      active
        ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"
        : "border-muted bg-muted/40 text-muted-foreground"
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", active ? "bg-green-500" : "bg-muted-foreground/40")} />
      <span>{label}</span>
      {detail && <span className="opacity-70">— {detail}</span>}
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
      <span className="leading-snug">{label}</span>
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
  const hasAppliedForCC = useWatch({ control: form.control, name: "standardIas.exemptionCertifiedCopy.hasApplied" });
  const delayActive = useWatch({ control: form.control, name: "standardIas.condonationOfDelay.active" });
  const ccActive = useWatch({ control: form.control, name: "standardIas.exemptionCertifiedCopy.active" });
  const surrenderActive = useWatch({ control: form.control, name: "standardIas.exemptionFromSurrendering.active" });
  const otActive = useWatch({ control: form.control, name: "standardIas.exemptionOfficialTranslation.active" });
  const adActive = useWatch({ control: form.control, name: "standardIas.additionalDocuments" });
  const otReason = useWatch({ control: form.control, name: "standardIas.exemptionOfficialTranslation.reason" });

  const isCriminal = caseType === "Criminal";

  // Which configurable IA is currently shown in the right panel
  const configurable = useMemo(() => {
    const items: { id: string; label: string; active: boolean }[] = [
      { id: "delay", label: "Condonation of Delay", active: !!delayActive },
      { id: "cc", label: "Exemption (Certified Copy)", active: !!ccActive },
      ...(isCriminal ? [{ id: "surrender", label: "Exemption (Surrender)", active: !!surrenderActive }] : []),
    ];
    return items;
  }, [delayActive, ccActive, surrenderActive, isCriminal]);

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
    if (selectedId === fieldId) {
      if (index > 0) setSelectedId(customIaFields[index - 1].id);
      else if (customIaFields.length > 1) setSelectedId(customIaFields[1].id);
      else setSelectedId("delay");
    }
    removeCustomIa(index);
  };

  // Keep selection valid when criminal toggles
  useEffect(() => {
    if (!isCriminal && selectedId === "surrender") setSelectedId("delay");
  }, [isCriminal, selectedId]);

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
      .map(n => `P-${n}`);
    let newReason = '';
    if (translated.length > 0) {
      const last = translated.pop();
      newReason = translated.length > 0 ? `Annexures ${translated.join(', ')} and ${last}` : `Annexure ${last}`;
    }
    if (newReason !== form.getValues('standardIas.exemptionOfficialTranslation.reason')) {
      form.setValue('standardIas.exemptionOfficialTranslation.reason', newReason);
    }
  }, [listOfDates, annexureNumberingMap, form]);

  // AD count & OT detail for pills
  const adCount = useMemo(() =>
    (listOfDates || []).flatMap(lod => lod.annexures || []).filter(a => a.isAdditionalDocument).length,
  [listOfDates]);

  return (
    <TooltipProvider>
      <div className="space-y-3 h-full flex flex-col">

        {/* ── Zone 1: Auto-included strip ── */}
        <div className="flex items-center justify-between gap-4 pb-3 border-b">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Auto-included</span>
            <Tooltip>
              <TooltipTrigger type="button">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs text-xs">These IAs are automatically generated based on your List of Dates entries. No manual input is needed.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <AutoPill
              label="Exemption (OT)"
              active={!!otActive}
              detail={otActive && otReason ? otReason : undefined}
            />
            <AutoPill
              label="Additional Documents (AD)"
              active={!!adActive}
              detail={adActive ? `${adCount} document${adCount !== 1 ? 's' : ''}` : undefined}
            />
          </div>
        </div>

        {/* ── Zone 2: Configurable IAs split view ── */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Configurable IAs</span>
            <Tooltip>
              <TooltipTrigger type="button">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs text-xs">Where you're invited to input grounds, please do not input the standard IA paragraphs. Those will be automatically inserted.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <ResizablePanelGroup direction="horizontal" className="rounded-lg border min-h-[360px]" autoSaveId="ias-tab-panels">
            {/* Left: IA list */}
            <ResizablePanel defaultSize={35} minSize={25}>
              <div className="flex flex-col h-full p-2 gap-1">
                {configurable.map(item => (
                  <IaListRow
                    key={item.id}
                    label={item.label}
                    active={item.active}
                    selected={selectedId === item.id}
                    onClick={() => setSelectedId(item.id)}
                  />
                ))}
                {!isCriminal && (
                  <div className="mt-1 px-2 py-1.5 rounded-md bg-muted/30 text-xs text-muted-foreground italic">
                    Exemption (Surrender) — only for criminal matters
                  </div>
                )}
                {customIaFields.length > 0 && (
                  <div className="mt-1 border-t pt-1 space-y-0.5">
                    {customIaFields.map((field, index) => (
                      <CustomIaListRow
                        key={field.id}
                        index={index}
                        selected={selectedId === field.id}
                        onClick={() => setSelectedId(field.id)}
                        onRemove={() => handleRemoveCustomIa(index)}
                      />
                    ))}
                  </div>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full justify-start text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => appendCustomIa(customIaSchema.parse({}))}
                >
                  <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Add Custom IA
                </Button>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Right: Detail panel */}
            <ResizablePanel defaultSize={65} minSize={40}>
              <div className="h-full overflow-auto p-3">

                {/* ── Delay ── */}
                {selectedId === "delay" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{standardIaList[0].title}</h4>
                      <FormField
                        control={form.control}
                        name="standardIas.condonationOfDelay.active"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-1.5 space-y-0">
                            <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} id="cod-active" /></FormControl>
                            <FormLabel htmlFor="cod-active" className="text-xs font-normal cursor-pointer">Include</FormLabel>
                          </FormItem>
                        )}
                      />
                    </div>
                    {delay > 0 ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Delay auto-computed:</span>
                        <FormField
                          control={form.control}
                          name="standardIas.condonationOfDelay.delayDays"
                          render={({ field: df }) => (
                            <FormItem>
                              <FormControl>
                                <Input type="number" className="w-20 h-7 text-xs" {...df} onChange={e => df.onChange(parseInt(e.target.value, 10) || 0)} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <span className="text-muted-foreground">days</span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Since there is no delay, this IA won't be included.</p>
                    )}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Grounds for Delay</h4>
                      <IaGroundTable name="standardIas.condonationOfDelay.grounds" />
                    </div>
                  </div>
                )}

                {/* ── Exemption CC ── */}
                {selectedId === "cc" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{standardIaList[1].title}</h4>
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
                            <FormLabel className="text-xs">Reason for not applying</FormLabel>
                            <FormControl><Textarea {...field} className="text-xs" /></FormControl>
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                )}

                {/* ── Exemption from Surrendering ── */}
                {selectedId === "surrender" && isCriminal && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{standardIaList[4].title}</h4>
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
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Grounds for Exemption from Surrendering</h4>
                      <IaGroundTable name="standardIas.exemptionFromSurrendering.grounds" />
                    </div>
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
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Grounds</h4>
                      <IaGroundTable name={`customIas.${index}.grounds`} />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Prayers</h4>
                      <AamTable name={`customIas.${index}.prayers`} />
                    </div>
                  </div>
                ))}

              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>



      </div>
    </TooltipProvider>
  );
}
