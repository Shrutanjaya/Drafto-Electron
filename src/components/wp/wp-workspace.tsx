"use client";

import { useState, useEffect, useRef } from "react";
import { useFormContext, useWatch, useFieldArray } from "react-hook-form";
import { Sparkles, PlusCircle, Columns2, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DraftoProject } from "@/lib/schema";
import { customIaSchema } from "@/lib/schema";
import { transposeLodToFacts } from "@/lib/wp/wp-facts";
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
import { DateInput } from "@/components/custom/date-input";
import { getSettings } from "@/components/dialogs/settings-dialog";

// ── Shared little components (mirrors the SLP tab) ───────────────────────────
function ViewToggle({ mode, onChange }: { mode: "splitter" | "navigation"; onChange: (m: "splitter" | "navigation") => void }) {
  return (
    <div className="flex items-center overflow-hidden rounded-md border">
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
    <button type="button" onClick={onClick}
      className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors", selected ? "bg-primary text-primary-foreground dark:text-white" : "text-foreground hover:bg-muted")}>
      <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", active ? (selected ? "bg-green-300" : "bg-green-500") : (selected ? "bg-primary-foreground/40" : "bg-muted-foreground/30"))} />
      <span className="leading-snug">{label}</span>
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
  const isIoWrit = useWatch({ control: form.control, name: "wp.isIoWrit" });
  const customCms = useFieldArray({ control: form.control, name: "wp.customCms" });

  // Editor-tab view mode (shares the SLP default + new-project event).
  const [viewMode, setViewMode] = useState<"splitter" | "navigation">(() => getSettings().slpTabView ?? "splitter");
  useEffect(() => {
    const onNew = (e: Event) => setViewMode((e as CustomEvent).detail?.mode ?? getSettings().slpTabView ?? "splitter");
    window.addEventListener("drafto-new-project", onNew);
    return () => window.removeEventListener("drafto-new-project", onNew);
  }, []);

  const [editorSection, setEditorSection] = useState<EditorSection>("synopsis");
  const [prelim, setPrelim] = useState<"parties" | "details" | "deponent" | "advocate">("parties");
  const [cmSection, setCmSection] = useState<"stay" | "lengthySynopsis" | "exemptionCopies" | "custom">(isIoWrit ? "stay" : "lengthySynopsis");

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
  };

  // Dot-active watches.
  const synopsis = useWatch({ control: form.control, name: "synopsis" });
  const lod = useWatch({ control: form.control, name: "listOfDates" });
  const reliefs = useWatch({ control: form.control, name: "wp.reliefs" });
  const facts = useWatch({ control: form.control, name: "wp.facts" });
  const grounds = useWatch({ control: form.control, name: "grounds" });
  const petitioners = useWatch({ control: form.control, name: "petitioners" });
  const advName = useWatch({ control: form.control, name: "wp.advocate.name" });
  const depName = useWatch({ control: form.control, name: "deponent.name" });
  const hasAam = (rows: any[]) => rows?.some((r: any) => r.particulars?.trim()) ?? false;
  const hasLoD = (rows: any[]) => rows?.some((r: any) => r.date?.trim() || r.event?.trim()) ?? false;

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
      <p className="text-xs text-muted-foreground">Attach annexures to the relevant rows, as in an SLP. The Facts section is generated from these rows.</p>
      <LoDTable />
    </div>
  );

  const reliefsEditor = (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Single source of truth — drives the top reliefs block and the intro paragraph. Keep the residuary prayer last.
        {isIoWrit && " Relief (a) to quash the impugned order is added automatically."}
      </p>
      <AamTable name="wp.reliefs" />
    </div>
  );

  const factsEditor = (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Transposed from the List of Dates (with annexure sentences). Editing locks it against regeneration.</p>
        <Button type="button" size="sm" variant="secondary" onClick={handleGenerateFacts}>
          <Sparkles className="mr-1 h-3.5 w-3.5" />Generate from List of Dates
        </Button>
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

  const groundsEditor = <AamTable name="grounds" />;

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
                <div className="flex-grow overflow-auto">{editorContent[editorSection]}</div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        <div className={cn("flex flex-col", PANEL_H)}>
          <div className="mb-1 flex items-center gap-1">
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
  const partiesContent = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div><p className="mb-1 text-xs font-medium">Petitioner(s)</p><VaadiTable name="petitioners" /></div>
      <div><p className="mb-1 text-xs font-medium">Respondent(s)</p><VaadiTable name="respondents" /></div>
    </div>
  );
  const detailsContent = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="Petition type">
        <FormField control={form.control} name="caseType" render={({ field }) => (
          <Select onValueChange={field.onChange} value={field.value}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Civil">Writ Petition (Civil)</SelectItem>
              <SelectItem value="Criminal">Writ Petition (Criminal)</SelectItem>
            </SelectContent>
          </Select>
        )} />
      </Field>
      <Field label="Constitutional basis">
        <FormField control={form.control} name="wp.articleBasis" render={({ field }) => (
          <Select onValueChange={field.onChange} value={field.value}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="226">Article 226</SelectItem>
              <SelectItem value="227">Article 227</SelectItem>
              <SelectItem value="226 read with 227">Article 226 read with 227</SelectItem>
            </SelectContent>
          </Select>
        )} />
      </Field>
      <Field label="Listing date" hint="Shown in the Notice of Motion (“likely to be listed on …”).">
        <FormField control={form.control} name="wp.listingDate" render={({ field }) => (
          <DateInput value={field.value as Date} onChange={field.onChange} />
        )} />
      </Field>
      <Field label="Impugned-order writ?" hint="If on, the impugned order is Annexure P-1 and relief (a) auto-quashes it; a Stay CM becomes available.">
        <FormField control={form.control} name="wp.isIoWrit" render={({ field }) => (
          <div className="flex items-center gap-2 pt-1">
            <Checkbox id="wp-io" checked={field.value} onCheckedChange={field.onChange} />
            <label htmlFor="wp-io" className="text-xs">This writ challenges an Impugned Order</label>
          </div>
        )} />
      </Field>
    </div>
  );
  const advInput = (name: any) => <FormField control={form.control} name={name} render={({ field }) => <Input {...field} />} />;
  const advocateContent = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <p className="col-span-full text-xs text-muted-foreground">Pre-filled from Settings → Writ Petition (DHC). Edit here to override for this petition only.</p>
      <Field label="Advocate name">{advInput("wp.advocate.name")}</Field>
      <Field label="Firm / Chamber">{advInput("wp.advocate.firm")}</Field>
      <Field label="Address"><FormField control={form.control} name="wp.advocate.address" render={({ field }) => <Textarea {...field} rows={2} />} /></Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Enrolment No.">{advInput("wp.advocate.enrolmentNo")}</Field>
        <Field label="Phone">{advInput("wp.advocate.phone")}</Field>
        <Field label="Email">{advInput("wp.advocate.email")}</Field>
      </div>
    </div>
  );
  const deponentContent = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <p className="col-span-full text-xs text-muted-foreground">Deponent for the affidavit &amp; verification. The name defaults to the first Petitioner if left blank.</p>
      <Field label="Deponent name">{advInput("deponent.name")}</Field>
      <Field label="Relationship">
        <FormField control={form.control} name="deponent.relationship" render={({ field }) => (
          <Select onValueChange={field.onChange} value={field.value}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="son of">son of</SelectItem>
              <SelectItem value="daughter of">daughter of</SelectItem>
              <SelectItem value="wife of">wife of</SelectItem>
            </SelectContent>
          </Select>
        )} />
      </Field>
      <Field label="Father’s / Husband’s name">{advInput("deponent.fatherName")}</Field>
      <Field label="Age (years)">{advInput("deponent.age")}</Field>
      <Field label="Address"><FormField control={form.control} name="deponent.address" render={({ field }) => <Textarea {...field} rows={2} />} /></Field>
    </div>
  );
  const prelimContent = { parties: partiesContent, details: detailsContent, deponent: deponentContent, advocate: advocateContent }[prelim];

  // ── Applications content ────────────────────────────────────────────────────
  const stayContent = (
    <div className="space-y-3">
      <FormField control={form.control} name="wp.cms.stay.active" render={({ field }) => (
        <div className="flex items-center gap-2">
          <Checkbox id="cm-stay" checked={field.value} onCheckedChange={field.onChange} />
          <label htmlFor="cm-stay" className="text-xs">Include a CM for Stay of the impugned order</label>
        </div>
      )} />
      <div><p className="mb-1 text-xs text-muted-foreground">Grounds for stay</p><AamTable name="wp.cms.stay.grounds" /></div>
    </div>
  );
  const lengthyContent = (
    <FormField control={form.control} name="wp.cms.lengthySynopsis.active" render={({ field }) => (
      <div className="flex items-center gap-2"><Checkbox id="cm-syn" checked={field.value} onCheckedChange={field.onChange} />
        <label htmlFor="cm-syn" className="text-xs">Include a CM seeking permission to file a lengthy Synopsis &amp; List of Dates</label></div>
    )} />
  );
  const exemptionContent = (
    <FormField control={form.control} name="wp.cms.exemptionCopies.active" render={({ field }) => (
      <div className="flex items-center gap-2"><Checkbox id="cm-exempt" checked={field.value} onCheckedChange={field.onChange} />
        <label htmlFor="cm-exempt" className="text-xs">Include a CM for exemption from filing certified / legible / true-typed copies</label></div>
    )} />
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
            <CustomIaCard key={f.id} index={i} basePath={`wp.customCms.${i}`} onRemove={() => customCms.remove(i)} />
          ))}</div>}
    </div>
  );
  const cmNav: { id: typeof cmSection; label: string; active: boolean; content: React.ReactNode }[] = [
    ...(isIoWrit ? [{ id: "stay" as const, label: "Stay of Impugned Order", active: !!form.watch("wp.cms.stay.active"), content: stayContent }] : []),
    { id: "lengthySynopsis", label: "Lengthy Synopsis", active: !!form.watch("wp.cms.lengthySynopsis.active"), content: lengthyContent },
    { id: "exemptionCopies", label: "Exemption of Copies", active: !!form.watch("wp.cms.exemptionCopies.active"), content: exemptionContent },
    { id: "custom", label: "Custom CMs", active: customCms.fields.length > 0, content: customContent },
  ];
  const cmActive = cmNav.find(c => c.id === cmSection) ?? cmNav[0];

  // Generic nav layout (left nav rows + right content), used by Preliminary & CMs.
  const navLayout = (rows: { id: string; label: string; active: boolean }[], selected: string, onSelect: (id: any) => void, content: React.ReactNode, autoSaveId: string) => (
    <div className={cn("flex flex-col", PANEL_H)}>
      <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId={autoSaveId}>
        <ResizablePanel defaultSize={22} minSize={16} maxSize={40}>
          <div className="flex h-full flex-col space-y-1 p-2">
            {rows.map(r => <NavRow key={r.id} label={r.label} active={r.active} selected={selected === r.id} onClick={() => onSelect(r.id)} />)}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={78} minSize={60}>
          <div className="h-full overflow-auto p-3">{content}</div>
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
            { id: "parties", label: "Parties", active: !!petitioners?.[0]?.name?.trim() },
            { id: "details", label: "Petition Details", active: true },
            { id: "deponent", label: "Deponent", active: !!depName?.trim() },
            { id: "advocate", label: "Advocate (“Filed by”)", active: !!advName?.trim() },
          ],
          prelim, setPrelim, prelimContent, "wp-prelim-nav",
        )}
      </TabsContent>

      <TabsContent value="petition" className="mt-1">{petitionTab}</TabsContent>

      <TabsContent value="cms" className="mt-1">
        <EditorProvider>
          {navLayout(cmNav.map(c => ({ id: c.id, label: c.label, active: c.active })), cmSection, setCmSection, cmActive.content, "wp-cm-nav")}
        </EditorProvider>
      </TabsContent>
    </Tabs>
  );
}
