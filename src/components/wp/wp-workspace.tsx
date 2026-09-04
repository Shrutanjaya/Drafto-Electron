"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useFormContext, useWatch, useFieldArray } from "react-hook-form";
import { Sparkles, PlusCircle, Columns2, LayoutList, ListPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DraftoProject } from "@/lib/schema";
import { customIaSchema } from "@/lib/schema";
import { transposeLodToFacts, transposableLodIds, lodFingerprint, appendNewLodRowsToFacts } from "@/lib/wp/wp-facts";
import { separateFactsMode, factsRowsFromLod } from "@/lib/wp/facts-mode";
import { wpIsIoWrit } from "@/lib/wp/wp-annexures";
import { WP_STD_CM_TITLES } from "@/lib/wp/wp-actions";
import { CustomIaCard } from "@/components/custom/custom-ia-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import { VaadiTable } from "@/components/custom/vaadi-table";
import { LoDTable } from "@/components/custom/lod-table";
import { AamTable } from "@/components/custom/aam-table";
import { BadhiyaBox } from "@/components/custom/badhiya-box";
import { EditorProvider } from "@/components/custom/editor-provider";
import { EditorToolbar } from "@/components/custom/editor-toolbar";
import { SectionDialog } from "@/components/custom/section-dialog";
import { DateInput } from "@/components/custom/date-input";
import { getSettings } from "@/components/dialogs/settings-dialog";
import { UseFirstPartyButton } from "@/components/custom/use-first-party-button";

// ── Shared little components (mirrors the SLP tab) ───────────────────────────
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
      <span className={cn("leading-snug", !active && !selected && "text-muted-foreground/60")}>{label}</span>
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

const PANEL_H = "h-[calc(100vh-160px)]";
type EditorSection = "synopsis" | "listOfDates" | "reliefs" | "facts" | "grounds";

export function WpWorkspace() {
  const form = useFormContext<DraftoProject>();
  // Whether this writ challenges an impugned order follows from the record —
  // an annexure marked as that order — rather than from a separate declaration
  // in Preliminary. Both sources of the mark are watched (the List of Dates, or
  // the Facts table when the two are kept apart) so the Stay application
  // appears the moment an order is marked.
  const lodRowsWatch = useWatch({ control: form.control, name: "listOfDates" });
  const factsRowsWatch = useWatch({ control: form.control, name: "wp.factsRows" as any });
  const stayActiveWatch = useWatch({ control: form.control, name: "wp.cms.stay.active" });
  const isIoWrit = useMemo(
    () => wpIsIoWrit(form.getValues()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lodRowsWatch, factsRowsWatch, stayActiveWatch],
  );
  const customCms = useFieldArray({ control: form.control, name: "wp.customCms" });

  // Editor-tab view mode (shares the SLP default + new-project event).
  const [viewMode, setViewMode] = useState<"splitter" | "navigation">(() => getSettings().slpTabView ?? "splitter");
  useEffect(() => {
    const onNew = (e: Event) => setViewMode((e as CustomEvent).detail?.mode ?? getSettings().slpTabView ?? "splitter");
    window.addEventListener("drafto-new-project", onNew);
    return () => window.removeEventListener("drafto-new-project", onNew);
  }, []);

  const [editorSection, setEditorSection] = useState<EditorSection>("synopsis");
  const [prelim, setPrelim] = useState<"parties" | "details" | "deponent">("parties");
  const [cmSection, setCmSection] = useState<"stay" | "lengthySynopsis" | "exemptionCopies" | "custom">(isIoWrit ? "stay" : "lengthySynopsis");

  // Which way this project works — chosen once in Settings.
  const separateFacts = separateFactsMode(form.getValues());

  // Separate-Facts mode: build the Facts rows from the List of Dates. The text
  // becomes "On <date>, <event>"; annexures are attached on the Facts table
  // itself (except for a project drafted before the switch, whose annexures
  // come across so nothing is lost).
  const handleGenerateFactsRows = () => {
    const proj = form.getValues();
    const existing = (proj.wp.factsRows || []).some((r: any) => (r.event || "").trim() || (r.annexures || []).length);
    if (existing && !window.confirm("Replace the Facts table with a fresh transposition from the List of Dates?")) return;
    form.setValue("wp.factsRows", factsRowsFromLod(proj) as any, { shouldDirty: true });
  };

  // Facts generation (edit-locked).
  const generatingFacts = useRef(false);
  const handleGenerateFacts = () => {
    const proj = form.getValues();
    if (proj.wp.factsEdited && (proj.wp.facts || "").trim()) {
      if (!window.confirm("Replace the current (edited) Facts with a fresh transposition from the List of Dates?")) return;
    }
    generatingFacts.current = true;
    form.setValue("wp.facts", transposeLodToFacts(proj), { shouldDirty: true });
    form.setValue("wp.factsEdited", false);
    form.setValue("wp.factsLodIds", transposableLodIds(proj));
    form.setValue("wp.factsLodFingerprint", lodFingerprint(proj));
  };
  // Append-only transposition: adds paragraphs for LoD rows added AFTER the last
  // generation without touching the (possibly hand-edited) existing Facts.
  const handleAppendNewRows = () => {
    const proj = form.getValues();
    const { html, appendedIds } = appendNewLodRowsToFacts(proj, proj.wp.facts || "", proj.wp.factsLodIds || []);
    if (appendedIds.length === 0) return;
    generatingFacts.current = true;
    form.setValue("wp.facts", html, { shouldDirty: true });
    form.setValue("wp.factsLodIds", [...(proj.wp.factsLodIds || []), ...appendedIds]);
    form.setValue("wp.factsLodFingerprint", lodFingerprint(proj));
  };

  // Dot-active watches.
  const synopsis = useWatch({ control: form.control, name: "synopsis" });
  const lod = useWatch({ control: form.control, name: "listOfDates" });
  const reliefs = useWatch({ control: form.control, name: "wp.reliefs" });
  const facts = useWatch({ control: form.control, name: "wp.facts" });
  const grounds = useWatch({ control: form.control, name: "grounds" });
  const petitioners = useWatch({ control: form.control, name: "petitioners" });
  const respondents = useWatch({ control: form.control, name: "respondents" });
  const caseType = useWatch({ control: form.control, name: "caseType" });
  const articleBasis = useWatch({ control: form.control, name: "wp.articleBasis" });
  const listingDate = useWatch({ control: form.control, name: "wp.listingDate" });
  const deponent = useWatch({ control: form.control, name: "deponent" });
  const hasAam = (rows: any[]) => rows?.some((r: any) => r.particulars?.trim()) ?? false;
  const hasLoD = (rows: any[]) => rows?.some((r: any) => r.date?.trim() || r.event?.trim()) ?? false;

  // ── Preliminary nav-dot readiness ──────────────────────────────────────────
  // Parties: every party has a name AND an address (Through is optional).
  const partiesFilled = (rows: any[]) =>
    Array.isArray(rows) && rows.length > 0 && rows.every((r: any) => r?.name?.trim() && r?.address?.trim());
  const prelimPartiesReady = partiesFilled(petitioners) && partiesFilled(respondents);
  // Details: type + article picked, and listing date is a future date (drawn-on optional).
  const listingIsFuture = (() => {
    if (!listingDate) return false;
    const d = new Date(listingDate as any);
    if (isNaN(d.getTime())) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d.getTime() > today.getTime();
  })();
  const prelimDetailsReady = !!caseType && !!articleBasis && listingIsFuture;
  // Deponent: everything except "presently at" (location) is mandatory.
  const prelimDeponentReady = (["name", "relationship", "fatherName", "age", "address", "role"] as const)
    .every((k) => String((deponent as any)?.[k] ?? "").trim());

  const active: Record<EditorSection, boolean> = {
    synopsis: !!synopsis?.trim(),
    listOfDates: hasLoD(lod),
    reliefs: hasAam(reliefs),
    facts: !!facts?.trim(),
    grounds: hasAam(grounds),
  };

  // ── Section content renderers ──────────────────────────────────────────────
  const synopsisEditor = (
    <FormField control={form.control} name="synopsis" render={({ field }) => (
      <FormItem className="flex h-full flex-col"><FormControl>
        <BadhiyaBox value={field.value} onChange={field.onChange} path={field.name} />
      </FormControl></FormItem>
    )} />
  );

  const lodEditor = (
    <div className="space-y-2">
      <FormField control={form.control} name="wp.splitSynopsisAndLod" render={({ field }) => (
        <div className="flex items-center gap-2">
          <Checkbox id="wp-split" checked={field.value} onCheckedChange={field.onChange} />
          <label htmlFor="wp-split" className="text-xs">Start List of Dates on a fresh page</label>
        </div>
      )} />
      <p className="text-xs text-muted-foreground">
        {separateFacts
          ? "Dates and particulars only — a concise chronology. The annexures live on the Facts table."
          : "Attach annexures to the relevant rows, as in an SLP. The Facts section is generated from these rows."}
      </p>
      <LoDTable hideAnnexures={separateFacts} />
    </div>
  );

  const reliefsEditor = (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Single source of truth — all rows (residuary prayer last) print in the top reliefs block, Para 1 (run together inline) and the final Prayers.
        Type each relief&rsquo;s own punctuation (&ldquo;; and&rdquo; between, a full stop after the last) — nothing is added automatically.
      </p>
      <AamTable name="wp.reliefs" />
    </div>
  );

  // Count of LoD rows added since the last generation (drives "Append new rows").
  const factsLodIds = useWatch({ control: form.control, name: "wp.factsLodIds" });
  const newLodRowCount = useMemo(() => {
    const done = new Set(factsLodIds || []);
    return transposableLodIds(form.getValues()).filter(id => !done.has(id)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lod, factsLodIds]);

  const factsEditor = separateFacts ? (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          One row per paragraph, with the annexures attached here. The List of Dates stays as your concise chronology.
        </p>
        <Button type="button" size="sm" variant="secondary" className="shrink-0" onClick={handleGenerateFactsRows}>
          <Sparkles className="mr-1 h-3.5 w-3.5" />Generate from List of Dates
        </Button>
      </div>
      <LoDTable name="wp.factsRows" hideDate />
    </div>
  ) : (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Transposed from the List of Dates (with annexure sentences). Editing locks it against regeneration.</p>
        <div className="flex shrink-0 items-center gap-1">
          {!!facts?.trim() && newLodRowCount > 0 && (
            <Button type="button" size="sm" variant="outline" title="Add paragraphs for List-of-Dates rows added after the last generation, without touching your edits" onClick={handleAppendNewRows}>
              <ListPlus className="mr-1 h-3.5 w-3.5" />Append {newLodRowCount} new row{newLodRowCount === 1 ? "" : "s"}
            </Button>
          )}
          <Button type="button" size="sm" variant="secondary" onClick={handleGenerateFacts}>
            <Sparkles className="mr-1 h-3.5 w-3.5" />Generate from List of Dates
          </Button>
        </div>
      </div>
      <FormField control={form.control} name="wp.facts" render={({ field }) => (
        <FormItem className="flex flex-grow flex-col"><FormControl>
          <BadhiyaBox value={field.value} onChange={(v: string) => {
            field.onChange(v);
            if (generatingFacts.current) generatingFacts.current = false;
            else form.setValue("wp.factsEdited", true);
          }} path={field.name} />
        </FormControl></FormItem>
      )} />
    </div>
  );

  const groundsEditor = <AamTable name="grounds" allowHeadings />;

  const editorContent: Record<EditorSection, React.ReactNode> = {
    synopsis: synopsisEditor,
    listOfDates: lodEditor,
    reliefs: reliefsEditor,
    facts: factsEditor,
    grounds: groundsEditor,
  };
  const editorLabels: [EditorSection, string][] = [
    ["synopsis", "Synopsis"],
    ["listOfDates", "List of Dates"],
    ["reliefs", "Reliefs"],
    ["facts", "Facts"],
    ["grounds", "Grounds"],
  ];

  // ── Petition tab (splitter / nav) ───────────────────────────────────────────
  const petitionTab = (
    <EditorProvider>
      {viewMode === "navigation" ? (
        <div className={cn("flex flex-col", PANEL_H)}>
          <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId="wp-editor-nav">
            <ResizablePanel defaultSize={22} minSize={16} maxSize={40}>
              <div className="flex h-full flex-col space-y-1 p-2">
                {editorLabels.map(([id, label]) => (
                  <NavRow key={id} label={label} active={active[id]} selected={editorSection === id} onClick={() => setEditorSection(id)} />
                ))}
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={78} minSize={60}>
              <div className="flex h-full flex-col space-y-2 p-2">
                <div className="flex shrink-0 items-center gap-1">
                  <div className="flex-grow" />
                  <EditorToolbar />
                  <ViewToggle mode={viewMode} onChange={setViewMode} />
                </div>
                {/* Keyed so switching sections remounts the inputs — reusing a
                    mounted Controller with a different `name` makes values bleed
                    between fields (blank/garbled data on return). */}
                <div key={editorSection} className="flex-grow overflow-auto">{editorContent[editorSection]}</div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        <div className={cn("flex flex-col", PANEL_H)}>
          <div className="mb-1 flex items-center gap-1">
            {/* Sections not shown as panels in split view open in dialogs. */}
            <SectionDialog label="Reliefs" active={active.reliefs}>{reliefsEditor}</SectionDialog>
            <SectionDialog label="Facts" active={active.facts}>{factsEditor}</SectionDialog>
            <div className="flex-grow" />
            <EditorToolbar />
            <ViewToggle mode={viewMode} onChange={setViewMode} />
          </div>
          <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId="wp-editor-split">
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
  );

  // ── Preliminary content ─────────────────────────────────────────────────────
  // The line under the name means different things on the two sides: a
  // petitioner describes themselves, a respondent is served through an officer.
  const petitionerThrough = 'E.g., working as Senior Accounts Officer (Group-A)';
  const respondentThrough = 'E.g., "Through the Secretary, Ministry of Home Affairs"';
  const partiesContent = (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div><p className="mb-1 text-xs font-medium">Petitioner(s)</p><VaadiTable name="petitioners" showPosition={false} showThrough throughPlaceholder={petitionerThrough} compactAdd /></div>
        <div><p className="mb-1 text-xs font-medium">Respondent(s)</p><VaadiTable name="respondents" showPosition={false} showThrough throughPlaceholder={respondentThrough} compactAdd /></div>
      </div>
    </div>
  );
  const detailsContent = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-xs">
        This is a
        <FormField control={form.control} name="caseType" render={({ field }) => (
          <Select onValueChange={field.onChange} value={field.value}>
            <SelectTrigger className="h-7 w-[180px] px-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Civil">Writ Petition (Civil)</SelectItem>
              <SelectItem value="Criminal">Writ Petition (Criminal)</SelectItem>
            </SelectContent>
          </Select>
        )} />
        under
        <FormField control={form.control} name="wp.articleBasis" render={({ field }) => (
          <Select onValueChange={field.onChange} value={field.value}>
            <SelectTrigger className="h-7 w-[210px] px-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="226">Article 226</SelectItem>
              <SelectItem value="227">Article 227</SelectItem>
              <SelectItem value="226 read with 227">Article 226 read with 227</SelectItem>
            </SelectContent>
          </Select>
        )} />
        , drawn on
        <FormField control={form.control} name="wp.drawnOnDate" render={({ field }) => (
          <DateInput value={field.value as Date} onChange={field.onChange} />
        )} />
        , likely to be listed on
        <FormField control={form.control} name="wp.listingDate" render={({ field }) => (
          <DateInput value={field.value as Date} onChange={field.onChange} />
        )} />
        .
      </div>
    </div>
  );
  // Deponent — sentence template mirrored from the SLP tool. Everything except
  // "presently at" (deponent.location) is mandatory.
  const depField = (name: any, placeholder: string, width: string) => (
    <FormField control={form.control} name={name} render={({ field }) => (
      <FormItem className="inline-block"><FormControl>
        <Input {...field} placeholder={placeholder} className={`h-7 px-2 ${width}`} />
      </FormControl></FormItem>
    )} />
  );
  const deponentContent = (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs">
      <div className="mb-1 flex w-full justify-end"><UseFirstPartyButton /></div>
      The Deponent is
      {depField("deponent.name", "Name", "w-[150px]")},
      <FormField control={form.control} name="deponent.relationship" render={({ field }) => (
        <FormItem className="inline-block">
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl><SelectTrigger className="h-7 px-2 w-[120px]"><SelectValue /></SelectTrigger></FormControl>
            <SelectContent>
              <SelectItem value="son of">son of</SelectItem>
              <SelectItem value="daughter of">daughter of</SelectItem>
              <SelectItem value="wife of">wife of</SelectItem>
            </SelectContent>
          </Select>
        </FormItem>
      )} />
      {depField("deponent.fatherName", "Father's Name", "w-[150px]")},
      aged
      {depField("deponent.age", "Age", "w-[50px]")}
      years, resident of
      <FormField control={form.control} name="deponent.address" render={({ field }) => (
        <FormItem className="inline-block flex-grow"><FormControl>
          <Textarea {...field} ref={(el) => { field.ref(el); if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} rows={1} placeholder="Address" className="px-2 min-h-0 text-xs overflow-hidden resize-none" onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }} />
        </FormControl></FormItem>
      )} />,
      presently at
      {depField("deponent.location", "Location", "w-[120px]")}.
      The Deponent is the
      <FormField control={form.control} name="deponent.role" render={({ field }) => (
        <FormItem className="inline-block">
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl><SelectTrigger className="h-7 px-2 w-[240px]"><SelectValue /></SelectTrigger></FormControl>
            <SelectContent>
              <SelectItem value="Petitioner">Petitioner</SelectItem>
              <SelectItem value="Petitioner No. 1">Petitioner No. 1</SelectItem>
              <SelectItem value="Pairokar of the Petitioner">Pairokar of the Petitioner</SelectItem>
              <SelectItem value="Pairokar of the Petitioner No. 1">Pairokar of the Petitioner No. 1</SelectItem>
              <SelectItem value="Authorised Representative of the Petitioner">Authorised Representative of the Petitioner</SelectItem>
              <SelectItem value="Authorised Representative of Petitioner No. 1">Authorised Representative of Petitioner No. 1</SelectItem>
              <SelectItem value="Legal Guardian of the Petitioner">Legal Guardian of the Petitioner</SelectItem>
              <SelectItem value="Legal Guardian of Petitioner No. 1">Legal Guardian of Petitioner No. 1</SelectItem>
              <SelectItem value="Power of Attorney Holder of the Petitioner">Power of Attorney Holder of the Petitioner</SelectItem>
              <SelectItem value="Power of Attorney Holder of Petitioner No. 1">Power of Attorney Holder of Petitioner No. 1</SelectItem>
            </SelectContent>
          </Select>
        </FormItem>
      )} />.
    </div>
  );
  const prelimContent = { parties: partiesContent, details: detailsContent, deponent: deponentContent }[prelim];

  // ── Applications content ────────────────────────────────────────────────────
  const cmToggle = (name: any, id: string, label: string) => (
    <FormField control={form.control} name={name} render={({ field }) => (
      <div className="flex items-center gap-2">
        <Checkbox id={id} checked={field.value} onCheckedChange={field.onChange} />
        <label htmlFor={id} className="text-xs">{label}</label>
      </div>
    )} />
  );
  const cmTitle = (name: any, defaultTitle: string) => (
    <FormField control={form.control} name={name} render={({ field }) => (
      <div className="space-y-1">
        <label className="text-xs font-medium">Application title</label>
        <p className="text-xs text-muted-foreground">Leave blank to use the standard title (shown greyed below).</p>
        <Textarea {...field} rows={2} placeholder={defaultTitle} className="text-xs" />
      </div>
    )} />
  );
  const cmBody = (name: any) => (
    <div><p className="mb-1 text-xs text-muted-foreground">Application paragraphs — editable; insert paras as needed. The opening (writ-petition reference), the good-faith closing and the prayer lead-in are added automatically.</p><AamTable name={name} /></div>
  );
  const cmPrayers = (name: any) => (
    <div><p className="mb-1 text-xs text-muted-foreground">Prayers — editable. The last is a residuary placeholder you can leave as-is.</p><AamTable name={name} /></div>
  );
  const stayContent = (
    <div className="space-y-3">
      {cmToggle("wp.cms.stay.active", "cm-stay", "Include a CM for Stay of the impugned order")}
      {cmTitle("wp.cms.stay.title", WP_STD_CM_TITLES.stay)}
      {cmBody("wp.cms.stay.body")}
      {cmPrayers("wp.cms.stay.prayers")}
    </div>
  );
  const lengthyContent = (
    <div className="space-y-3">
      {cmToggle("wp.cms.lengthySynopsis.active", "cm-syn", "Include a CM seeking permission to file a lengthy Synopsis & List of Dates")}
      {cmTitle("wp.cms.lengthySynopsis.title", WP_STD_CM_TITLES.lengthySynopsis)}
      {cmBody("wp.cms.lengthySynopsis.body")}
      {cmPrayers("wp.cms.lengthySynopsis.prayers")}
    </div>
  );
  const exemptionContent = (
    <div className="space-y-3">
      {cmToggle("wp.cms.exemptionCopies.active", "cm-exempt", "Include a CM for exemption from filing certified / legible / true-typed copies")}
      {cmTitle("wp.cms.exemptionCopies.title", WP_STD_CM_TITLES.exemptionCopies)}
      {cmBody("wp.cms.exemptionCopies.body")}
      {cmPrayers("wp.cms.exemptionCopies.prayers")}
    </div>
  );
  const customContent = (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Custom CMs</span>
        <Button type="button" size="sm" variant="outline" onClick={() => customCms.append(customIaSchema.parse({}))}>
          <PlusCircle className="mr-1 h-3.5 w-3.5" />Add
        </Button>
      </div>
      {customCms.fields.length === 0
        ? <p className="text-xs text-muted-foreground">No custom applications. Add one for any CM beyond the three standard ones (each gets its own A-series annexures).</p>
        : <div className="space-y-2">{customCms.fields.map((f, i) => (
            <CustomIaCard key={f.id} index={i} basePath={`wp.customCms.${i}`} para2Label="This application is being filed praying that…" onRemove={() => customCms.remove(i)} />
          ))}</div>}
    </div>
  );
  const cmNav: { id: typeof cmSection; label: string; active: boolean; content: React.ReactNode }[] = [
    // Available once an annexure is marked as the impugned order (or the
    // application is already switched on) — see wpIsIoWrit.
    ...(isIoWrit ? [{ id: "stay" as const, label: "Stay of Impugned Order", active: !!form.watch("wp.cms.stay.active"), content: stayContent }] : []),
    { id: "lengthySynopsis", label: "Lengthy Synopsis", active: !!form.watch("wp.cms.lengthySynopsis.active"), content: lengthyContent },
    { id: "exemptionCopies", label: "Exemption of Copies", active: !!form.watch("wp.cms.exemptionCopies.active"), content: exemptionContent },
    { id: "custom", label: "Custom CMs", active: customCms.fields.length > 0, content: customContent },
  ];
  const cmActive = cmNav.find(c => c.id === cmSection) ?? cmNav[0];

  // Generic nav layout (left nav rows + right content), used by Preliminary & CMs.
  const navLayout = (rows: { id: string; label: string; active: boolean; heading?: string; pushDown?: boolean }[], selected: string, onSelect: (id: any) => void, content: React.ReactNode, autoSaveId: string) => (
    <div className={cn("flex flex-col", PANEL_H)}>
      <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId={autoSaveId}>
        <ResizablePanel defaultSize={22} minSize={16} maxSize={40}>
          <div className="flex h-full flex-col space-y-1 p-2">
            {rows.map(r => (
              <React.Fragment key={r.id}>
                {r.heading && (
                  // pushDown holds the group at the foot of the panel, under a
                  // rule, so what is being filed reads as one list and what is
                  // not sits apart from it.
                  <p className={cn(
                    "px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70",
                    r.pushDown && "mt-auto border-t pt-2",
                  )}>{r.heading}</p>
                )}
                <NavRow label={r.label} active={r.active} selected={selected === r.id} onClick={() => onSelect(r.id)} />
              </React.Fragment>
            ))}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={78} minSize={60}>
          {/* Keyed by the selected section: the sections render structurally
              identical field trees, so without a remount React reuses the live
              Controllers and only swaps their `name` prop — react-hook-form then
              bleeds values across fields (the blank/garbled Advocate & Deponent
              pages). */}
          <div key={selected} className="h-full overflow-auto p-3">{content}</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );

  return (
    <Tabs defaultValue="preliminary" className="p-1">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="preliminary">Preliminary</TabsTrigger>
        <TabsTrigger value="petition">Petition</TabsTrigger>
        <TabsTrigger value="cms">Applications</TabsTrigger>
      </TabsList>

      <TabsContent value="preliminary" className="mt-1">
        {navLayout(
          [
            { id: "parties", label: "Parties", active: prelimPartiesReady },
            { id: "details", label: "Petition Details", active: prelimDetailsReady },
            { id: "deponent", label: "Deponent", active: prelimDeponentReady },
          ],
          prelim, setPrelim, prelimContent, "wp-prelim-nav",
        )}
      </TabsContent>

      <TabsContent value="petition" className="mt-1">{petitionTab}</TabsContent>

      <TabsContent value="cms" className="mt-1">
        <EditorProvider>
          {navLayout(
            // Included applications above, the rest below and dulled — with a
            // heading on the first of each half so the split is legible.
            (() => {
              const inc = cmNav.filter(c => c.active);
              const exc = cmNav.filter(c => !c.active);
              return [
                ...inc.map((c, i) => ({ id: c.id, label: c.label, active: true, heading: i === 0 ? "Included" : undefined })),
                ...exc.map((c, i) => ({ id: c.id, label: c.label, active: false, heading: i === 0 ? "Not included" : undefined, pushDown: i === 0 })),
              ];
            })(),
            cmSection, setCmSection, cmActive.content, "wp-cm-nav",
          )}
        </EditorProvider>
      </TabsContent>
    </Tabs>
  );
}
