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
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useMemo, useState } from "react";
import { IaGroundTable } from "@/components/custom/ia-ground-table";
import { Button } from "@/components/ui/button";
import { PlusCircle, Trash2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { AamTable } from "@/components/custom/aam-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { wpAnnexureOrderFromLods } from "@/lib/wp/wp-annexures";
import {
  IA_COMMON_CLOSING,
  IA_PRAYER_LEAD,
  IA_PRAYER_TAIL,
  CUSTOM_IA_PARA2_LEAD,
} from "@/lib/ia-preview";

const SC_WP_IA_OPENING = "The accompanying Writ Petition has been filed under Article 32 of the Constitution of India. The contents of the Writ Petition may kindly be treated as part and parcel of this application and are not being repeated herein for the sake of brevity.";

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

function IaListRow({ label, active, selected, onClick }: { label: string; active?: boolean; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-ro-nav
      onClick={onClick}
      className={cn(
        "w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2",
        selected
          ? "bg-primary text-primary-foreground dark:text-white"
          : active
          ? "hover:bg-muted text-foreground"
          : "hover:bg-muted text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full flex-shrink-0",
          active
            ? selected ? "bg-green-300" : "bg-green-500"
            : selected ? "bg-primary-foreground/40" : "bg-muted-foreground/30"
        )}
      />
      <span className="truncate leading-snug">{label}</span>
    </button>
  );
}

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
  const customTitle = useWatch({ control: form.control, name: `customIas.${index}.title` });
  const rowLabel = customTitle?.trim() || `Custom IA ${index + 1}`;

  return (
    <div
      data-ro-nav
      onClick={onClick}
      className={cn(
        "group w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2 cursor-pointer",
        selected
          ? "bg-primary text-primary-foreground dark:text-white"
          : "hover:bg-muted text-foreground"
      )}
    >
      <span className={cn("h-2 w-2 rounded-full flex-shrink-0", selected ? "bg-green-300" : "bg-green-500")} />
      <span className="truncate leading-snug flex-1">{rowLabel}</span>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            className={cn(
              "opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/20 text-destructive",
              selected && "text-primary-foreground hover:bg-primary-foreground/20"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Custom IA</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove &ldquo;{rowLabel}&rdquo;? This action cannot be undone.
            </AlertDialogDescription>
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

export function ScWpIasTab() {
  const form = useFormContext<DraftoProject>();
  const [selectedId, setSelectedId] = useState<string>("ot");

  const { fields: customIaFields, append: appendCustomIa, remove: removeCustomIa } = useFieldArray({
    control: form.control,
    name: "customIas",
  });

  const listOfDates = useWatch({ control: form.control, name: "listOfDates" });
  const otActive = useWatch({ control: form.control, name: "standardIas.exemptionOfficialTranslation.active" });
  const otReason = useWatch({ control: form.control, name: "standardIas.exemptionOfficialTranslation.reason" });
  const otUserReason = useWatch({ control: form.control, name: "standardIas.exemptionOfficialTranslation.userReason" });

  // Auto-sync official translation active and reason based on translated copies in LoD
  useEffect(() => {
    const allAnnexures: Annexure[] = (listOfDates || []).flatMap(lod => lod.annexures || []);
    const hasTranslated = allAnnexures.some(a =>
      a.copyType === 'translated copy' || a.copyType === 'true and translated copy'
    );
    if (hasTranslated !== form.getValues("standardIas.exemptionOfficialTranslation.active")) {
      form.setValue("standardIas.exemptionOfficialTranslation.active", hasTranslated, { shouldDirty: true });
    }

    const orderedAnnexures = wpAnnexureOrderFromLods(listOfDates || []);
    const translatedPNums = orderedAnnexures
      .filter(e => e.annex.copyType === 'translated copy' || e.annex.copyType === 'true and translated copy')
      .map(e => `P-${e.pNumber}`);

    let newReason = '';
    if (translatedPNums.length > 0) {
      const last = translatedPNums.pop();
      newReason = translatedPNums.length > 0 ? `Annexures ${translatedPNums.join(', ')} and ${last}` : `Annexure ${last}`;
    }
    if (newReason !== form.getValues('standardIas.exemptionOfficialTranslation.reason')) {
      form.setValue('standardIas.exemptionOfficialTranslation.reason', newReason, { shouldDirty: true });
    }
  }, [listOfDates, form]);

  const handleRemoveCustomIa = (index: number) => {
    const fieldId = customIaFields[index]?.id;
    removeCustomIa(index);
    if (selectedId === fieldId) {
      setSelectedId("ot");
    }
  };

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col">
        <ResizablePanelGroup direction="horizontal" className="rounded-lg border flex-1 min-h-[500px]" autoSaveId="sc-wp-ias-panels">
          {/* Left Navigation */}
          <ResizablePanel defaultSize={30} minSize={20} maxSize={40}>
            <div className="flex flex-col h-full overflow-auto p-2 gap-0.5">
              {(() => {
                const rows = [
                  { id: "ot", label: "Exemption (Official Translation)", included: !!otActive, show: true },
                ].filter(r => r.show);

                const included = rows.filter(r => r.included);
                const excluded = rows.filter(r => !r.included);

                return (
                  <>
                    <NavSection label="Included" hint="Applications to be filed with the Writ Petition." />
                    {included.map(r => (
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
                      className="w-full justify-start text-xs text-muted-foreground hover:text-foreground mt-1"
                      onClick={() => {
                        appendCustomIa(customIaSchema.parse({}));
                      }}
                    >
                      <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Add Custom IA
                    </Button>

                    {excluded.length > 0 && (
                      <>
                        <NavSection label="Not Included" hint="Optional applications currently not enabled." />
                        {excluded.map(r => (
                          <IaListRow key={r.id} label={r.label} active={false} selected={selectedId === r.id} onClick={() => setSelectedId(r.id)} />
                        ))}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Detail Panel */}
          <ResizablePanel defaultSize={70} minSize={60}>
            <div className="flex flex-col h-full overflow-auto p-4 space-y-4">

              {/* ── Official Translation ── */}
              {selectedId === "ot" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">
                      {`Application for exemption from filing official translation of ${otReason || "annexures"}`}
                    </h4>
                    <FormField
                      control={form.control}
                      name="standardIas.exemptionOfficialTranslation.active"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-1.5 space-y-0">
                          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} id="ot-active" /></FormControl>
                          <FormLabel htmlFor="ot-active" className="text-xs font-normal cursor-pointer">Include in Paper-Book</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>

                  <StandardBlock startNum={1} paras={[SC_WP_IA_OPENING]} />

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

                  <StandardBlock
                    startNum={2}
                    paras={[`This application seeks exemption from filing official translation of ${otReason || "certain annexures"}. ${otUserReason?.trim() ? `${otUserReason.trim()} ` : ""}It is respectfully submitted that true and correct translations of the said documents have been placed on record. The Petitioner undertakes to file official translations as and when directed by this Hon'ble Court.`]}
                  />
                  <StandardBlock startNum={3} paras={IA_COMMON_CLOSING} />
                  <div className="space-y-1">
                    <p className={STD_TEXT}>
                      <span className="font-medium mr-1">4.</span>
                      {IA_PRAYER_LEAD}
                    </p>
                    <ol className="list-[lower-alpha] pl-6 space-y-0.5">
                      <li className={STD_TEXT}>{`Grant exemption to the Petitioner(s) from filing official translation of ${otReason || "certain annexures"}; and`}</li>
                      <li className={STD_TEXT}>{IA_PRAYER_TAIL}</li>
                    </ol>
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
                  <StandardBlock startNum={1} paras={[SC_WP_IA_OPENING]} />
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
                  <StandardBlock startNum={3} paras={["The Petitioner is approaching this Hon'ble Court on the following amongst other grounds:"]} />
                  <IaGroundTable name={`customIas.${index}.grounds`} />
                  <StandardBlock startNum={4} paras={IA_COMMON_CLOSING} />
                  <StandardBlock startNum={5} paras={[IA_PRAYER_LEAD]} />
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
