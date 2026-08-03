"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Sparkles, ListPlus, Columns2, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import { VaadiTable } from "@/components/custom/vaadi-table";
import { AamTable } from "@/components/custom/aam-table";
import { BadhiyaBox } from "@/components/custom/badhiya-box";
import { LoDTable } from "@/components/custom/lod-table";
import { EditorProvider } from "@/components/custom/editor-provider";
import { EditorToolbar } from "@/components/custom/editor-toolbar";
import { SectionDialog } from "@/components/custom/section-dialog";
import { OaApplications } from "@/components/oa/oa-applications";
import type { DraftoProject } from "@/lib/schema";
import { getSettings } from "@/components/dialogs/settings-dialog";
import { oaBench } from "@/lib/oa/oa-benches";
import { transposeLodToFacts, transposableLodIds, lodFingerprint, appendNewLodRowsToFacts } from "@/lib/wp/wp-facts";
import { generateOaAll } from "@/lib/oa/oa-actions";
import { oaMaSchema } from "@/lib/schema";
import { useCanExport } from "@/providers/entitlement-provider";
import { useToast } from "@/hooks/use-toast";
import { getProjectFileName } from "@/components/header";
import { saveAs } from "file-saver";

const OA_RESIDUARY = "Pass such other/further orders as this Hon’ble Tribunal may deem fit and proper in the facts and circumstances of the case.";

const APPLICANT_THROUGH_PLACEHOLDER = 'E.g., "Through the Secretary, Ministry of Home Affairs"';
const PANEL_H = "h-[calc(100vh-170px)]";

type OaSection = "synopsis" | "listOfDates" | "reliefs" | "facts" | "grounds" | "jurisdiction" | "interim" | "other";

// Sub-paragraph styles for a numbered parent para — the decimal option is
// labelled with that para's own number (4.1 for Facts, 5.1 for Grounds).
const subparaStyles = (parentNum: number) => [
  { value: "decimal-sub", label: `${parentNum}.1, ${parentNum}.2` },
  { value: "lower-alpha", label: "a, b, c" },
  { value: "upper-alpha", label: "A, B, C" },
  { value: "lower-roman", label: "i, ii, iii" },
  { value: "upper-roman", label: "I, II, III" },
];
const SUBPARA_STYLES_PRAYER = [
  { value: "lower-roman", label: "i, ii, iii" },
  { value: "upper-roman", label: "I, II, III" },
  { value: "lower-alpha", label: "a, b, c" },
  { value: "upper-alpha", label: "A, B, C" },
];

function ViewToggle({ mode, onChange }: { mode: "splitter" | "navigation"; onChange: (m: "splitter" | "navigation") => void }) {
  return (
    <div data-ro-nav className="flex items-center overflow-hidden rounded-md border">
      <button type="button" title="Splitter view" onClick={() => onChange("splitter")}
        className={cn("flex items-center gap-1 px-2 py-1 text-xs transition-colors", mode === "splitter" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
        <Columns2 className="h-3 w-3" />Split
      </button>
      <button type="button" title="Navigation view" onClick={() => onChange("navigation")}
        className={cn("flex items-center gap-1 border-l px-2 py-1 text-xs transition-colors", mode === "navigation" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
        <LayoutList className="h-3 w-3" />Nav
      </button>
    </div>
  );
}

function NavRow({ label, active, selected, onClick }: { label: string; active: boolean; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" data-ro-nav onClick={onClick}
      className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors", selected ? "bg-primary text-primary-foreground dark:text-white" : "text-foreground hover:bg-muted")}>
      <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", active ? (selected ? "bg-green-300" : "bg-green-500") : (selected ? "bg-primary-foreground/40" : "bg-muted-foreground/30"))} />
      <span className="leading-snug">{label}</span>
    </button>
  );
}

function StylePicker({ name, options }: { name: any; options: { value: string; label: string }[] }) {
  const form = useFormContext<DraftoProject>();
  return (
    <FormField control={form.control} name={name} render={({ field }) => (
      <FormItem className="inline-flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Sub-para</span>
        <Select onValueChange={field.onChange} value={field.value}>
          <FormControl><SelectTrigger className="h-6 w-[110px] px-2 text-[11px]"><SelectValue /></SelectTrigger></FormControl>
          <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
        </Select>
      </FormItem>
    )} />
  );
}

// Central Administrative Tribunal — Original Application interface.
export function OaWorkspace() {
  const form = useFormContext<DraftoProject>();
  const bench = oaBench(getSettings().oaBench);
  const { toast } = useToast();
  const canExport = useCanExport();

  const [section, setSection] = useState<OaSection>("synopsis");
  const [viewMode, setViewMode] = useState<"splitter" | "navigation">(getSettings().slpTabView ?? "splitter");

  // Watches for nav-dot activity.
  const synopsis = useWatch({ control: form.control, name: "synopsis" });
  const lod = useWatch({ control: form.control, name: "listOfDates" });
  const reliefs = useWatch({ control: form.control, name: "oa.reliefs" });
  const facts = useWatch({ control: form.control, name: "oa.facts" });
  const grounds = useWatch({ control: form.control, name: "grounds" });
  const jurPosted = useWatch({ control: form.control, name: "oa.jurisdictionPosted" });
  const jurCause = useWatch({ control: form.control, name: "oa.jurisdictionCause" });
  const limitation = useWatch({ control: form.control, name: "oa.limitation" });
  const delayDays = useWatch({ control: form.control, name: "oa.delayDays" });
  const interimNil = useWatch({ control: form.control, name: "oa.interimNil" });
  const interimReliefs = useWatch({ control: form.control, name: "oa.interimReliefs" });
  const postalOrders = useWatch({ control: form.control, name: "oa.postalOrders" });
  const petitioners = useWatch({ control: form.control, name: "petitioners" });

  // ── Applications (MAs / PT) ─────────────────────────────────────────────────
  const applicantCount = (petitioners || []).filter((p: any) => p?.name?.trim()).length;
  const needsDelay = limitation === "delay" || limitation === "abundantCaution";
  const needsJoinder = applicantCount > 1;
  const needsPt = !jurPosted && !jurCause;

  // Auto-insert / remove the triggered MAs (delay, joinder) and the PT.
  useEffect(() => {
    const cur = form.getValues("oa.mas") || [];
    let next = [...cur];
    const ensure = (kind: string, need: boolean, extra?: Record<string, unknown>) => {
      const has = next.some((m: any) => m.kind === kind);
      if (need && !has) next = [oaMaSchema.parse({ kind, ...(extra ?? {}) }), ...next];
      else if (!need && has) next = next.filter((m: any) => m.kind !== kind);
    };
    ensure("pt", needsPt);
    // "Abundant caution" asserts there is no delay, so its application prays to
    // condone "the delay, if any" — i.e. the without-prejudice variant.
    ensure("delay", needsDelay, { delayWithoutPrejudice: limitation === "abundantCaution" });
    ensure("joinder", needsJoinder);
    const sig = (a: any[]) => a.map((m) => m.kind).join("|") + "#" + a.map((m) => m.id).join(",");
    if (sig(next) !== sig(cur)) form.setValue("oa.mas", next, { shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsDelay, needsJoinder, needsPt, limitation]);



  const hasAam = (rows: any[]) => rows?.some((r: any) => r.particulars?.trim()) ?? false;
  const hasLoD = (rows: any[]) => rows?.some((r: any) => r.date?.trim() || r.event?.trim()) ?? false;

  const active: Record<OaSection, boolean> = {
    synopsis: !!synopsis?.trim(),
    listOfDates: hasLoD(lod),
    reliefs: hasAam(reliefs),
    facts: !!facts?.trim(),
    grounds: hasAam(grounds),
    jurisdiction: !!jurPosted || !!jurCause || limitation !== "noDelay",
    interim: !!interimNil || hasAam(interimReliefs),
    other: !!postalOrders?.trim(),
  };

  // Facts generation from the List of Dates (with annexure sentences).
  const generatingFacts = useRef(false);
  const handleGenerateFacts = () => {
    const proj = form.getValues();
    if (proj.oa.factsEdited && (proj.oa.facts || "").trim()) {
      if (!window.confirm("Replace the current (edited) Facts with a fresh transposition from the List of Dates?")) return;
    }
    generatingFacts.current = true;
    form.setValue("oa.facts", transposeLodToFacts(proj, "A"), { shouldDirty: true });
    form.setValue("oa.factsEdited", false);
    form.setValue("oa.factsLodIds", transposableLodIds(proj));
    form.setValue("oa.factsLodFingerprint", lodFingerprint(proj));
  };
  const handleAppendNewRows = () => {
    const proj = form.getValues();
    const { html, appendedIds } = appendNewLodRowsToFacts(proj, proj.oa.facts || "", proj.oa.factsLodIds || [], "A");
    if (appendedIds.length === 0) return;
    generatingFacts.current = true;
    form.setValue("oa.facts", html, { shouldDirty: true });
    form.setValue("oa.factsLodIds", [...(proj.oa.factsLodIds || []), ...appendedIds]);
    form.setValue("oa.factsLodFingerprint", lodFingerprint(proj));
  };
  const factsLodIds = useWatch({ control: form.control, name: "oa.factsLodIds" });
  const newLodRowCount = useMemo(() => {
    const done = new Set(factsLodIds || []);
    return transposableLodIds(form.getValues()).filter((id) => !done.has(id)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lod, factsLodIds]);

  const generateOa = async () => {
    if (!canExport) { toast({ variant: "destructive", title: "Subscription required", description: "Document generation is disabled because your subscription isn’t active." }); return; }
    try {
      const res = await generateOaAll(form.getValues());
      if (!res.success || !res.docx) throw new Error("Generation failed");
      if (window.electron?.saveDocx) {
        const saved = await window.electron.saveDocx({
          fileName: res.fileName,
          content: res.docx,
          defaultPath: getSettings().defaultDocxPath || undefined,
          projectFolder: getProjectFileName(form.getValues()),
        });
        if (saved) { toast({ title: "OA generated", description: `Saved to ${saved}` }); return; }
      }
      const bytes = Uint8Array.from(atob(res.docx), (c) => c.charCodeAt(0));
      saveAs(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), res.fileName);
      toast({ title: "OA generated", description: res.fileName });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Generation failed", description: e?.message || String(e) });
    }
  };

  // ── Section editors ─────────────────────────────────────────────────────────
  const synopsisEditor = (
    <FormField control={form.control} name="synopsis" render={({ field }) => (
      <FormItem className="flex h-full flex-col"><FormControl>
        <BadhiyaBox value={field.value} onChange={field.onChange} path={field.name} />
      </FormControl></FormItem>
    )} />
  );

  const lodEditor = (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Attach annexures to the relevant rows, as in an SLP. The Facts section (Para 4) is generated from these rows, with their annexure sentences.</p>
      <LoDTable />
    </div>
  );

  const reliefsEditor = (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Main prayers — used in Para 1 (inline) and Para 8 (Prayers). The residuary “Pass such other/further orders…” is added automatically.</p>
        <StylePicker name="oa.numbering.prayer" options={SUBPARA_STYLES_PRAYER} />
      </div>
      <AamTable name="oa.reliefs" />
      <p className="rounded-md bg-muted/40 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-medium">Added automatically as the last prayer — you don’t need to type it:</span>{" "}
        {OA_RESIDUARY}
      </p>
    </div>
  );

  const factsEditor = (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Para 4 — transposed from the List of Dates (with annexure sentences). Editing locks it against regeneration.</p>
        <div className="flex shrink-0 items-center gap-1">
          <StylePicker name="oa.numbering.facts" options={subparaStyles(4)} />
          {!!facts?.trim() && newLodRowCount > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={handleAppendNewRows}>
              <ListPlus className="mr-1 h-3.5 w-3.5" />Append {newLodRowCount} new row{newLodRowCount === 1 ? "" : "s"}
            </Button>
          )}
          <Button type="button" size="sm" variant="secondary" onClick={handleGenerateFacts}>
            <Sparkles className="mr-1 h-3.5 w-3.5" />Generate from List of Dates
          </Button>
        </div>
      </div>
      <FormField control={form.control} name="oa.facts" render={({ field }) => (
        <FormItem className="flex flex-grow flex-col"><FormControl>
          <BadhiyaBox value={field.value} onChange={(v: string) => {
            field.onChange(v);
            if (generatingFacts.current) generatingFacts.current = false;
            else form.setValue("oa.factsEdited", true);
          }} path={field.name} />
        </FormControl></FormItem>
      )} />
    </div>
  );

  const groundsEditor = (
    <div className="space-y-2">
      <div className="flex items-center justify-end"><StylePicker name="oa.numbering.grounds" options={subparaStyles(5)} /></div>
      <AamTable name="grounds" />
    </div>
  );

  const jurisdictionEditor = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Para 2 — Jurisdiction</p>
        <FormField control={form.control} name="oa.jurisdictionPosted" render={({ field }) => (
          <div className="flex items-start gap-2"><Checkbox id="oa-jur-posted" checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
            <label htmlFor="oa-jur-posted" className="text-xs">The Applicant is posted for the time being within the jurisdiction of this Hon’ble Tribunal.</label></div>
        )} />
        <FormField control={form.control} name="oa.jurisdictionPostedNote" render={({ field }) => (
          <Textarea {...field} rows={1} placeholder="Optional rider…" className="text-xs" />
        )} />
        <FormField control={form.control} name="oa.jurisdictionCause" render={({ field }) => (
          <div className="mt-2 flex items-start gap-2"><Checkbox id="oa-jur-cause" checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
            <label htmlFor="oa-jur-cause" className="text-xs">The cause of action of the present OA arose within the jurisdiction of this Hon’ble Tribunal.</label></div>
        )} />
        <FormField control={form.control} name="oa.jurisdictionCauseNote" render={({ field }) => (
          <Textarea {...field} rows={1} placeholder="Optional rider…" className="text-xs" />
        )} />
        <p className="text-[11px] italic text-amber-600 dark:text-amber-500">If neither is ticked, the Section-25 sentence prints and a Petition for Transfer is generated (Applications tab).</p>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Para 3 — Limitation</p>
        <FormField control={form.control} name="oa.limitation" render={({ field }) => (
          <RadioGroup value={field.value} onValueChange={field.onChange} className="gap-2">
            <div className="flex items-start gap-2">
              <RadioGroupItem value="noDelay" id="lim-none" className="mt-0.5" />
              <label htmlFor="lim-none" className="text-xs leading-snug">
                The Applicant declares that there is no delay in filing of the present OA and the same is within limitation.
              </label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="delay" id="lim-delay" className="mt-0.5" />
              <label htmlFor="lim-delay" className="text-xs leading-snug">
                The Applicant declares that there is a delay of{" "}
                <span className="font-semibold">{delayDays?.trim() || "__"}</span> days in filing of this OA and an
                application for condonation of delay of the said period is being filed along with this OA.
              </label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="abundantCaution" id="lim-caution" className="mt-0.5" />
              <label htmlFor="lim-caution" className="text-xs leading-snug">
                The Applicant declares that there is no delay in filing of the present OA and the same is within
                limitation. However, by way of abundant caution and without prejudice to the Applicant’s aforesaid
                stance, an application for condonation of delay is being filed along with this OA.
              </label>
            </div>
          </RadioGroup>
        )} />
        {limitation === "delay" && (
          <div className="flex items-center gap-2 pl-6 text-xs">Delay of
            <FormField control={form.control} name="oa.delayDays" render={({ field }) => (<Input {...field} placeholder="__" className="h-7 w-16 px-2 text-xs" />)} /> days
            <span className="text-muted-foreground">(auto-calculated from the last Impugned Order; editable)</span>
          </div>
        )}
        <FormField control={form.control} name="oa.limitationNote" render={({ field }) => (
          <Textarea {...field} rows={1} placeholder="Optional rider to add after the above declaration…" className="text-xs" />
        )} />
        <p className="text-[11px] italic text-amber-600 dark:text-amber-500">
          The second and third options generate a Condonation-of-Delay application in the Applications tab.
        </p>
      </div>
    </div>
  );

  const interimEditor = (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Para 9 — Interim Relief</p>
      <FormField control={form.control} name="oa.interimNil" render={({ field }) => (
        <div className="flex items-center gap-2"><Checkbox id="oa-interim-nil" checked={field.value} onCheckedChange={field.onChange} />
          <label htmlFor="oa-interim-nil" className="text-xs">NIL (no interim relief sought)</label></div>
      )} />
      {!interimNil && (
        <div className="space-y-2">
          <div className="flex items-center justify-end"><StylePicker name="oa.numbering.interim" options={SUBPARA_STYLES_PRAYER} /></div>
          <AamTable name="oa.interimReliefs" />
          <p className="rounded-md bg-muted/40 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-medium">Added automatically as the last prayer — you don’t need to type it:</span>{" "}
            {OA_RESIDUARY}
          </p>
        </div>
      )}
    </div>
  );

  const otherEditor = (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Para 11 — Particulars of postal orders (Application Fee)</p>
      <FormField control={form.control} name="oa.postalOrders" render={({ field }) => (<Textarea {...field} rows={3} placeholder="Postal-order particulars (blank allowed)…" className="text-xs" />)} />
    </div>
  );

  const editorContent: Record<OaSection, React.ReactNode> = {
    synopsis: synopsisEditor,
    listOfDates: lodEditor,
    reliefs: reliefsEditor,
    facts: factsEditor,
    grounds: groundsEditor,
    jurisdiction: jurisdictionEditor,
    interim: interimEditor,
    other: otherEditor,
  };
  const editorLabels: [OaSection, string][] = [
    ["synopsis", "Synopsis"],
    ["listOfDates", "List of Dates"],
    ["facts", "Facts"],
    ["grounds", "Grounds"],
    ["reliefs", "Main Prayers"],
    ["interim", "Interim Relief"],
    ["jurisdiction", "Jurisdiction & Limitation"],
    ["other", "Postal Orders"],
  ];

  const toolbar = (
    <div className="flex shrink-0 items-center gap-1">
      <Button type="button" size="sm" className="mr-1 h-7 text-xs" onClick={generateOa} disabled={!canExport}>Generate OA (.docx)</Button>
      <div className="flex-grow" />
      <EditorToolbar />
      <ViewToggle mode={viewMode} onChange={setViewMode} />
    </div>
  );

  // Split view shows LoD | Grounds | Synopsis; the remaining sections open in
  // dialogs from the toolbar (same pattern as the SLP tab).
  const splitSectionButtons = (
    <div className="flex flex-wrap items-center gap-1">
      <SectionDialog label="Facts" active={active.facts}>{factsEditor}</SectionDialog>
      <SectionDialog label="Main Prayers" active={active.reliefs}>{reliefsEditor}</SectionDialog>
      <SectionDialog label="Interim Relief" active={active.interim}>{interimEditor}</SectionDialog>
      <SectionDialog label="Jurisdiction & Limitation" active={active.jurisdiction}>{jurisdictionEditor}</SectionDialog>
      <SectionDialog label="Postal Orders" active={active.other}>{otherEditor}</SectionDialog>
    </div>
  );

  return (
    <Tabs defaultValue="preliminary" className="p-1">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="preliminary">Preliminary</TabsTrigger>
        <TabsTrigger value="oa">Original Application</TabsTrigger>
        <TabsTrigger value="applications">Applications</TabsTrigger>
      </TabsList>

      {/* ── Preliminary ── */}
      <TabsContent value="preliminary" className="mt-1 space-y-4 p-1">
        <p className="text-xs text-muted-foreground">
          Before the Central Administrative Tribunal, <span className="font-medium">{bench.header}</span>. Change the Bench in Settings → Original Application.
        </p>
        <FormField control={form.control} name="oa.legalAid" render={({ field }) => (
          <div className="flex items-center gap-2"><Checkbox id="oa-legal-aid" checked={field.value} onCheckedChange={field.onChange} />
            <label htmlFor="oa-legal-aid" className="text-xs">Legal-aid case assigned by the Delhi State Legal Services Authority</label></div>
        )} />

        {/* Multi-applicant signing. Only meaningful with several Applicants. */}
        {/* Neutral grey in both themes — the theme's --muted is blue-tinted in dark
            mode, which made this card read as an active/selected panel. */}
        <div className="space-y-1.5 rounded-md border border-neutral-200 bg-neutral-100/60 p-2.5 dark:border-neutral-700 dark:bg-neutral-800/40">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Signing {applicantCount <= 1 && <span className="font-normal normal-case">— applies once there is more than one Applicant</span>}
          </p>
          {([
            ["oa.authorityLetters", "oa-cb-auth", "Applicant No. 2 onwards will sign Authority Letters in favour of Applicant No. 1."],
            ["oa.separateLastPages", "oa-cb-lastpage", "Each Applicant will sign a different Last Page."],
            ["oa.separateVakalatnamas", "oa-cb-vak", "Each Applicant will sign a different Vakalatnama."],
          ] as const).map(([name, id, label]) => (
            <FormField key={id} control={form.control} name={name} render={({ field }) => (
              <div className="flex items-start gap-2">
                <Checkbox id={id} checked={field.value} onCheckedChange={field.onChange} disabled={applicantCount <= 1} className="mt-0.5" />
                <label htmlFor={id} className={"text-xs leading-snug " + (applicantCount <= 1 ? "text-muted-foreground" : "")}>{label}</label>
              </div>
            )} />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium">Applicant(s)</p>
            <p className="mb-1 text-[11px] text-muted-foreground">Each Applicant’s own particulars are used on the last page, vakalatnama and affidavit they sign.</p>
            <VaadiTable name="petitioners" showPosition={false} showThrough throughPlaceholder={APPLICANT_THROUGH_PLACEHOLDER} compactAdd showDeponentDetails />
          </div>
          <div><p className="mb-1 text-xs font-medium">Respondent(s)</p><VaadiTable name="respondents" showPosition={false} showThrough throughPlaceholder={APPLICANT_THROUGH_PLACEHOLDER} compactAdd /></div>
        </div>
      </TabsContent>

      {/* ── Original Application body (Split / Nav) ── */}
      <TabsContent value="oa" className="mt-1">
        <EditorProvider>
          {viewMode === "navigation" ? (
            <div className={cn("flex flex-col", PANEL_H)}>
              <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId="oa-editor-nav">
                <ResizablePanel defaultSize={22} minSize={16} maxSize={40}>
                  <div className="flex h-full flex-col space-y-1 p-2">
                    {editorLabels.map(([id, label]) => (
                      <NavRow key={id} label={label} active={active[id]} selected={section === id} onClick={() => setSection(id)} />
                    ))}
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={78} minSize={60}>
                  <div className="flex h-full flex-col space-y-2 p-2">
                    {toolbar}
                    <div key={section} className="flex-grow overflow-auto">{editorContent[section]}</div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          ) : (
            <div className={cn("flex flex-col", PANEL_H)}>
              <div className="mb-1 space-y-1">{toolbar}{splitSectionButtons}</div>
              <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId="oa-editor-split">
                <ResizablePanel defaultSize={50}>
                  <div className="flex h-full flex-col p-1">
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-slate-300">List of Dates</h4>
                    <div className="flex-grow overflow-auto">{lodEditor}</div>
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={30}>
                  <div className="flex h-full flex-col p-1">
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-slate-300">Grounds</h4>
                    <div className="flex-grow overflow-auto">{groundsEditor}</div>
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={20}>
                  <div className="flex h-full flex-col p-1">
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-slate-300">Synopsis</h4>
                    <div className="flex-grow overflow-auto">{synopsisEditor}</div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          )}
        </EditorProvider>
      </TabsContent>

      {/* ── Applications (MAs / PT) ── */}
      <TabsContent value="applications" className="mt-1 p-1">
        <div className={cn("flex flex-col", PANEL_H)}>
          <OaApplications />
        </div>
      </TabsContent>

    </Tabs>
  );
}
