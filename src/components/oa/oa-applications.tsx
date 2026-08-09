"use client";

import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Trash2, ArrowUp, ArrowDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AamTable } from "@/components/custom/aam-table";
import { oaMaSchema, type DraftoProject } from "@/lib/schema";
import { maProvision, maFirstPrayer } from "@/lib/oa/oa-actions";

const STD_TEXT = "text-xs leading-relaxed text-neutral-500 dark:text-neutral-400";
const RESIDUARY = "Pass such other/further orders as this Hon’ble Tribunal may deem fit and proper in the facts and circumstances of the case.";

const KIND_LABEL: Record<string, string> = {
  pt: "Petition for Transfer",
  delay: "Condonation of Delay",
  joinder: "Joinder of Applicants",
  exemptCopies: "Exemption — Copies",
  exemptTranslation: "Exemption — Translations",
  custom: "Custom Application",
};
const AUTO_KINDS = ["delay", "joinder", "pt"];
// Applications the user adds themselves. Custom stays offered even once added —
// an OA may carry several.
const ADDABLE_KINDS = ["exemptCopies", "exemptTranslation", "custom"];
// What brings each automatic application in, so a greyed row explains itself
// rather than looking broken.
const AUTO_TRIGGER_HINT: Record<string, string> = {
  delay: "Appears when you record a delay in the Limitation section.",
  joinder: "Appears when there is more than one Applicant.",
  pt: "Appears when neither jurisdiction basis is asserted.",
};

const PRAYER_STYLES = [
  { value: "lower-roman", label: "i, ii, iii" },
  { value: "upper-roman", label: "I, II, III" },
  { value: "lower-alpha", label: "a, b, c" },
  { value: "upper-alpha", label: "A, B, C" },
];

function NavSection({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-1 px-1 pb-0.5 pt-2.5 first:pt-0">
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

/**
 * A field that shows Drafto's standard wording as real, readable text rather
 * than a grey hint — but keeps it LIVE until the user chooses to depart from it.
 *
 * Prefilling the box with a snapshot would freeze it: the standard delay prayer
 * names the number of days, so a petition whose delay is later corrected would
 * keep praying on the old figure. So the standard is displayed read-only and
 * recomputed on every render; "Edit" copies it in and hands over control, and
 * "Use standard" gives it back.
 */
function StandardOrCustom({
  value,
  standard,
  onChange,
}: { value: string; standard: string; onChange: (v: string) => void }) {
  const custom = value.trim().length > 0;
  return (
    <div className="space-y-0.5">
      <Input
        value={custom ? value : standard}
        readOnly={!custom}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-7 text-xs", !custom && "bg-muted/40 text-muted-foreground")}
      />
      <button
        type="button"
        className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        onClick={() => onChange(custom ? "" : standard)}
      >
        {custom ? "Use the standard wording" : "Edit this wording"}
      </button>
    </div>
  );
}

/**
 * A row in the applications nav.
 *
 * `active` is the dot — whether anything has been written yet. `dulled` is
 * separate, because an application can be going into the paper-book while still
 * empty; only the ones that are NOT going in are greyed.
 */
function ListRow({ label, active, selected, onClick, dulled }: { label: string; active: boolean; selected: boolean; onClick: () => void; dulled?: boolean }) {
  return (
    <button type="button" data-ro-nav onClick={onClick}
      className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        selected ? "bg-primary text-primary-foreground dark:text-white" : "text-foreground hover:bg-muted")}>
      <span className={cn("h-2 w-2 flex-shrink-0 rounded-full",
        active ? (selected ? "bg-green-300" : "bg-green-500") : (selected ? "bg-primary-foreground/40" : "bg-muted-foreground/30"))} />
      <span className={cn("leading-snug", dulled && !selected && "text-muted-foreground/60")}>{label}</span>
    </button>
  );
}

/**
 * An application that is not in the paper-book and cannot simply be clicked in:
 * the automatic ones are owned by their trigger, so adding one by hand would be
 * undone on the next render. Shown greyed with what brings it in.
 */
function TriggerRow({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs">
      <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-muted-foreground/20" />
      <div className="min-w-0">
        <span className="leading-snug text-muted-foreground/60">{label}</span>
        <p className="text-[10px] leading-snug text-muted-foreground/50">{hint}</p>
      </div>
    </div>
  );
}

// Preset (auto-generated) paragraphs, shown greyed with their real numbers so
// the user can see exactly where their own paragraphs will be inserted.
function StandardBlock({ startNum, paras }: { startNum?: number; paras: string[] }) {
  const items = paras.filter((p) => p && p.trim() !== "");
  if (!items.length) return null;
  return (
    <div className="space-y-1.5">
      {items.map((p, i) => (
        <p key={i} className={STD_TEXT}>
          {startNum != null && <span className="mr-1 font-medium">{startNum + i}.</span>}
          {p}
        </p>
      ))}
    </div>
  );
}

/**
 * CAT Applications tab — Miscellaneous Applications and the Petition for
 * Transfer, laid out like the SLP tool's Applications tab: a classified nav on
 * the left, and a detail panel on the right where the frozen paragraphs are
 * visible above and below the user's own editable paragraphs.
 */
export function OaApplications() {
  const form = useFormContext<DraftoProject>();
  // NOTE: deliberately NOT useFieldArray. The auto-MA effect in the workspace
  // writes this array with form.setValue(); a useFieldArray bound to the same
  // path keeps its own copy, goes stale against those writes, and resurrects
  // removed items on the next remove(). All mutations here go through setValue
  // on a freshly-read array, so there is exactly one owner of oa.mas.
  const mas = useWatch({ control: form.control, name: "oa.mas" }) || [];
  const writeMas = (next: any[]) => form.setValue("oa.mas", next, { shouldDirty: true });
  const removeMaById = (id: string) => writeMas((form.getValues("oa.mas") || []).filter((m: any) => m.id !== id));
  const moveMaById = (id: string, dir: -1 | 1) => {
    const cur = [...(form.getValues("oa.mas") || [])];
    const i = cur.findIndex((m: any) => m.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cur.length) return;
    [cur[i], cur[j]] = [cur[j], cur[i]];
    writeMas(cur);
  };
  const petitioners = useWatch({ control: form.control, name: "petitioners" });
  const applicantCount = (petitioners || []).filter((p: any) => p?.name?.trim()).length;

  const [selectedId, setSelectedId] = useState<string>("");
  const selIdx = mas.findIndex((m: any) => m.id === selectedId);
  const idx = selIdx >= 0 ? selIdx : (selectedId ? -1 : mas.length ? 0 : -1);
  const ma: any = idx >= 0 ? mas[idx] : null;

  const project = form.getValues();
  const plural = applicantCount > 1;
  const Appl = plural ? "Applicants" : "Applicant";
  const stdProvision = ma ? maProvision(project, { ...ma, provision: "" }) : "";
  const stdFirstPrayer = ma ? maFirstPrayer(project, { ...ma, firstPrayer: "" }) : "";
  const effFirstPrayer = ma ? maFirstPrayer(project, ma) : "";
  const praySubstance = effFirstPrayer.replace(/;\s*and\s*$/i, "").trim();
  const shortLabel = ma?.kind === "pt" ? "Petition for Transfer" : "MA";
  // Shown on the condonation application. The prayer already takes the figure
  // from here, so this only makes visible what was always the case.
  const delayDaysText = (() => {
    const d = String(project?.oa?.delayDays ?? "").trim();
    return d ? `${d} days` : "";
  })();
  const hasContent = (m: any) => (m.body || []).some((b: any) => (b.particulars || "").replace(/<[^>]+>/g, "").trim());

  // Preset paras are numbered 1..N; the closing ones continue after however
  // many paragraphs the user has added, so the preview always matches the docx.
  const presetAbove = 2 + (ma?.kind === "joinder" ? 1 : 0);
  const userParaCount = (ma?.body || []).filter((b: any) => (b.particulars || "").replace(/<[^>]+>/g, "").trim()).length;
  const closingStart = presetAbove + userParaCount + 1;


  const addKind = (kind: string) => {
    const created = oaMaSchema.parse({ kind });
    writeMas([...(form.getValues("oa.mas") || []), created]);
    setSelectedId(created.id);
  };

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        <ResizablePanelGroup direction="horizontal" className="min-h-[440px] flex-1 rounded-lg border" autoSaveId="oa-applications-panels">
          {/* Left: classified nav */}
          <ResizablePanel defaultSize={32} minSize={24}>
            <div className="flex h-full flex-col gap-0.5 overflow-auto p-2">
              {/* What is going into the paper-book, in the user's own order
                  (the arrows inside an application move it), then what is not. */}
              <NavSection label="Included" hint="These are going into the paper-book. Reorder them with the arrows inside an application." />
              {mas.length === 0 && <p className="px-2 py-1 text-[11px] italic text-muted-foreground">None yet.</p>}
              {mas.map((m: any) => (
                <ListRow key={m.id} label={KIND_LABEL[m.kind]} active={hasContent(m)} selected={m.id === mas[idx]?.id} onClick={() => setSelectedId(m.id)} />
              ))}

              <NavSection label="Not included" hint="Click one to add it. The automatic ones come in on their own when their trigger fires." />
              {ADDABLE_KINDS.filter((k) => k === "custom" || !mas.some((m: any) => m.kind === k)).map((k) => (
                <ListRow
                  key={`add-${k}`}
                  label={k === "custom" ? "Custom Application" : KIND_LABEL[k]}
                  active={false}
                  dulled
                  selected={false}
                  onClick={() => addKind(k)}
                />
              ))}
              {AUTO_KINDS.filter((k) => !mas.some((m: any) => m.kind === k)).map((k) => (
                <TriggerRow key={`trigger-${k}`} label={KIND_LABEL[k]} hint={AUTO_TRIGGER_HINT[k]} />
              ))}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: detail */}
          <ResizablePanel defaultSize={68} minSize={45}>
            <div className="h-full overflow-auto p-3">
              {!ma ? (

                <p className="text-xs italic text-muted-foreground">No applications yet. Add one from the left, or they appear automatically when triggered.</p>
              ) : (
                <div className="space-y-3">
                  {/* Header: title + order / remove controls */}
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-slate-300">{KIND_LABEL[ma.kind]}</h4>
                    <span className="flex shrink-0 items-center gap-0.5">
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" disabled={idx === 0} onClick={() => moveMaById(ma.id, -1)} title="Move earlier"><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" disabled={idx === mas.length - 1} onClick={() => moveMaById(ma.id, 1)} title="Move later"><ArrowDown className="h-3.5 w-3.5" /></Button>
                      {!AUTO_KINDS.includes(ma.kind) && (
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => { removeMaById(ma.id); setSelectedId(""); }} title="Remove"><Trash2 className="h-3.5 w-3.5" /></Button>
                      )}
                    </span>
                  </div>

                  {/* Editable heading inputs */}
                  <div className="space-y-1.5">
                    <div className="space-y-0.5">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Under (provision)</span>
                      <StandardOrCustom
                        value={ma.provision || ""}
                        standard={stdProvision}
                        onChange={(v) => form.setValue(`oa.mas.${idx}.provision` as const, v, { shouldDirty: true })}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">First prayer (end with “; and”)</span>
                      <StandardOrCustom
                        value={ma.firstPrayer || ""}
                        standard={stdFirstPrayer}
                        onChange={(v) => form.setValue(`oa.mas.${idx}.firstPrayer` as const, v, { shouldDirty: true })}
                      />
                    </div>
                    {ma.kind === "delay" && (
                      <p className="text-[10px] text-muted-foreground">
                        Delay: <span className="font-medium text-foreground">{delayDaysText || "not set"}</span> — taken from the Limitation section of the Application tab, so the two can never disagree.
                      </p>
                    )}
                    {ma.kind === "delay" && (
                      <FormField control={form.control} name={`oa.mas.${idx}.delayWithoutPrejudice` as const} render={({ field }) => (
                        <div className="flex items-center gap-2"><Checkbox id={`ma-wp-${idx}`} checked={field.value} onCheckedChange={field.onChange} />
                          <label htmlFor={`ma-wp-${idx}`} className="text-xs">Without prejudice — pray to condone “the delay, if any”</label></div>
                      )} />
                    )}
                    {(ma.kind === "exemptCopies" || ma.kind === "exemptTranslation") && (
                      <div className="space-y-0.5">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Annexures</span>
                        <FormField control={form.control} name={`oa.mas.${idx}.annexureList` as const} render={({ field }) => (
                          <Input {...field} placeholder="e.g., A-1, A-3 and A-5  (or  A-3 to A-6)" className="h-7 text-xs" />
                        )} />
                      </div>
                    )}
                  </div>

                  {/* Title preview */}
                  <p className={STD_TEXT}>
                    <span className="font-medium">Heading: </span>
                    {ma.kind === "pt" ? "PETITION FOR TRANSFER" : "MISCELLANEOUS APPLICATION"} UNDER {(ma.provision?.trim() || stdProvision).toUpperCase()} PRAYING THAT THIS HON’BLE TRIBUNAL MAY BE PLEASED TO {praySubstance.toUpperCase()}.
                  </p>

                  {/* Frozen paras ABOVE the user's own */}
                  <StandardBlock startNum={1} paras={[
                    `The accompanying OA has been filed praying that this Hon’ble Tribunal may be pleased to <the OA prayers>. The contents of the OA are not being repeated herein for the sake of brevity and may kindly be read as part and parcel of this ${shortLabel}.`,
                    `By this ${shortLabel}, the ${Appl} ${plural ? "pray" : "prays"} that this Hon’ble Tribunal may be pleased to ${praySubstance || "<first prayer>"}.`,
                    ...(ma.kind === "joinder" ? ["The Applicants submit that they have a common interest in the matter having regard to the cause of action and nature of relief prayed for."] : []),
                  ]} />

                  {/* The user's own paragraphs */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Your paragraphs — inserted here as {presetAbove + 1}{userParaCount > 1 ? `–${presetAbove + userParaCount}` : ""}</span>
                      <FormField control={form.control} name={`oa.mas.${idx}.numbering` as const} render={({ field }) => (
                        <FormItem className="inline-flex items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Prayers</span>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger className="h-6 w-[110px] px-2 text-[11px]"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>{PRAYER_STYLES.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                    </div>
                    <AamTable name={`oa.mas.${idx}.body`} />
                  </div>

                  {/* Frozen paras BELOW the user's own — numbered on from the
                      user's rows, so the count tracks what they add above. */}
                  <StandardBlock startNum={closingStart} paras={[`This ${shortLabel} is filed in good faith and in the interests of justice.`]} />
                  <div className="space-y-1">
                    <p className={STD_TEXT}>
                      <span className="mr-1 font-medium">{closingStart + 1}.</span>
                      <span className="font-medium">PRAYERS:</span> In view of the foregoing submissions, it is most respectfully prayed that this Hon’ble Tribunal may be pleased to:
                    </p>
                    <p className={cn(STD_TEXT, "pl-4")}>(i) {effFirstPrayer || "<first prayer>"}</p>
                    <p className={cn(STD_TEXT, "pl-4")}>(ii) {RESIDUARY}</p>
                    <p className={cn(STD_TEXT, "italic")}>And for which act of kindness, the humble {Appl} shall ever pray.</p>
                    <p className={STD_TEXT}>[Filed-by block] — followed by this application’s Affidavit.</p>
                  </div>
                </div>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TooltipProvider>
  );
}
