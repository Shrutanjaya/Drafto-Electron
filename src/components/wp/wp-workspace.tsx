"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useFormContext, useWatch, useFieldArray } from "react-hook-form";
import { useStickyState } from "@/hooks/useStickyState";
import { Sparkles, PlusCircle, Columns2, Columns3, LayoutList, ListPlus, RotateCcw, Maximize2, Minimize2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DraftoProject } from "@/lib/schema";
import { customIaSchema } from "@/lib/schema";
import { FactsSection } from "@/components/custom/facts-section";
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
import { DateInput } from "@/components/custom/date-input";
import { getSettings } from "@/components/dialogs/settings-dialog";
import { UseFirstPartyButton } from "@/components/custom/use-first-party-button";
import { getWpFiledBy } from "@/lib/wp/wp-settings";
import { countParties, getPartyGrammar, adaptPartyText } from "@/lib/party-grammar";
import { MayurButton } from "@/components/custom/mayur-button";

// ── Header for modular pane in High Court Writ Petitions ────────────────────
function WpPaneHeader({
  paneIndex,
  section,
  onSelectSection,
  sections,
  isMaximized,
  onToggleMaximize,
}: {
  paneIndex: number;
  section: EditorSection;
  onSelectSection: (section: EditorSection) => void;
  sections: { id: EditorSection; label: string; active: boolean }[];
  isMaximized: boolean;
  onToggleMaximize: () => void;
}) {
  const current = sections.find((s) => s.id === section);
  const mayurSecMap: Record<EditorSection, string> = {
    synopsis: "synopsis",
    listOfDates: "lod",
    reliefs: "reliefs",
    facts: "facts",
    grounds: "grounds",
  };

  return (
    <div className="flex items-center justify-between gap-1 pb-1 mb-1 border-b border-border/50 shrink-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <Select value={section} onValueChange={(v) => onSelectSection(v as EditorSection)}>
          <SelectTrigger className="h-7 text-xs font-semibold px-2 py-0 border-0 bg-transparent hover:bg-muted/60 shadow-none gap-1.5 focus:ring-0 w-auto cursor-pointer">
            <span className="flex items-center gap-1.5 truncate">
              <span
                className={cn(
                  "h-2 w-2 rounded-full flex-shrink-0 transition-colors",
                  current?.active ? "bg-green-500" : "bg-muted-foreground/30"
                )}
              />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent className="text-xs">
            {sections.map((s) => (
              <SelectItem key={s.id} value={s.id} className="cursor-pointer">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full flex-shrink-0",
                      s.active ? "bg-green-500" : "bg-muted-foreground/30"
                    )}
                  />
                  <span>{s.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {mayurSecMap[section] && <MayurButton section={mayurSecMap[section]} />}
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
          title={isMaximized ? "Restore split view" : "Maximize this pane"}
          onClick={onToggleMaximize}
        >
          {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </Button>
      </div>
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

  // Modular 2-pane / 3-pane state for High Court Writ Petitions
  const defaultWpSlots: [EditorSection, EditorSection, EditorSection] = [
    "listOfDates",
    "grounds",
    "synopsis",
  ];

  const [paneCount, setPaneCount] = useStickyState<2 | 3>("wp-tab-pane-count", getSettings().defaultPanes ?? 3);
  const [paneSlots, setPaneSlots] = useStickyState<[EditorSection, EditorSection, EditorSection]>(
    "wp-tab-pane-slots",
    defaultWpSlots
  );
  const [maximizedPane, setMaximizedPane] = useState<number | null>(null);

  // Sequences for "View Next" cycling (5 sections)
  const twoPaneSets: [EditorSection, EditorSection][] = useMemo(() => [
    ["listOfDates", "synopsis"],
    ["grounds", "facts"],
    ["reliefs", "listOfDates"],
  ], []);

  const threePaneSets: [EditorSection, EditorSection, EditorSection][] = useMemo(() => [
    ["listOfDates", "grounds", "synopsis"],
    ["facts", "reliefs", "grounds"],
  ], []);

  const handleTogglePaneCount = () => {
    const nextCount: 2 | 3 = paneCount === 3 ? 2 : 3;
    setPaneCount(nextCount);
    setMaximizedPane(null);
    if (nextCount === 2) {
      const current = [paneSlots[0], paneSlots[1]];
      const match = twoPaneSets.some(([a, b]) => a === current[0] && b === current[1]);
      if (!match) {
        const [s0, s1] = twoPaneSets[0];
        setPaneSlots((prev) => [s0, s1, prev[2]]);
      }
    } else {
      const match = threePaneSets.some(([a, b, c]) => a === paneSlots[0] && b === paneSlots[1] && c === paneSlots[2]);
      if (!match) {
        setPaneSlots(threePaneSets[0]);
      }
    }
  };

  const handleViewNext = () => {
    setMaximizedPane(null);
    if (paneCount === 2) {
      const current = [paneSlots[0], paneSlots[1]];
      const matchIdx = twoPaneSets.findIndex(
        ([a, b]) => a === current[0] && b === current[1]
      );
      const nextIdx = (matchIdx + 1) % twoPaneSets.length;
      const [s0, s1] = twoPaneSets[nextIdx];
      setPaneSlots((prev) => [s0, s1, prev[2]]);
    } else {
      const matchIdx = threePaneSets.findIndex(
        ([a, b, c]) => a === paneSlots[0] && b === paneSlots[1] && c === paneSlots[2]
      );
      const nextIdx = (matchIdx + 1) % threePaneSets.length;
      const [s0, s1, s2] = threePaneSets[nextIdx];
      setPaneSlots([s0, s1, s2]);
    }
  };

  const handleSelectPane = (paneIndex: number, newSection: EditorSection) => {
    setPaneSlots((prev) => {
      const next = [...prev] as [EditorSection, EditorSection, EditorSection];
      const maxSlots = paneCount;
      const existingIndex = next.slice(0, maxSlots).findIndex((s, idx) => s === newSection && idx !== paneIndex);
      if (existingIndex !== -1) {
        next[existingIndex] = next[paneIndex];
      }
      next[paneIndex] = newSection;
      return next;
    });
  };
  const [prelim, setPrelim] = useState<"parties" | "details" | "disclosures" | "advocate" | "deponent">("parties");
  const [cmSection, setCmSection] = useState<"stay" | "lengthySynopsis" | "exemptionCopies" | "custom">(isIoWrit ? "stay" : "lengthySynopsis");

  const annexureMode = useWatch({ control: form.control, name: "wp.annexureMode" as any }) || "lod";

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
  const wpAdv = useWatch({ control: form.control, name: "wp.advocate" });
  const filingPlaceWatch = useWatch({ control: form.control, name: "advocate.filingPlace" });
  const deponent = useWatch({ control: form.control, name: "deponent" });
  const wpDisclosures = useWatch({ control: form.control, name: "wp.indexDisclosures" as any });

  // Auto-sync unedited preset CM body/prayer sentences between singular/plural when party counts change
  useEffect(() => {
    const g = getPartyGrammar({ petitioners, respondents, courtType: "dhc" });
    const paths = [
      "wp.cms.stay.body",
      "wp.cms.stay.prayers",
      "wp.cms.lengthySynopsis.body",
      "wp.cms.lengthySynopsis.prayers",
      "wp.cms.exemptionCopies.body",
      "wp.cms.exemptionCopies.prayers",
    ] as const;
    for (const p of paths) {
      const rows = form.getValues(p as any) || [];
      let changed = false;
      const updated = rows.map((r: any) => {
        const next = adaptPartyText(r?.particulars || "", g);
        if (next !== r?.particulars) {
          changed = true;
          return { ...r, particulars: next };
        }
        return r;
      });
      if (changed) {
        form.setValue(p as any, updated, { shouldDirty: true });
      }
    }
  }, [petitioners, respondents, form]);
  const hasAam = (rows: any[]) => Array.isArray(rows) && rows.some((r: any) => String(r?.particulars ?? "").trim().length > 0);
  const hasLoD = (rows: any[]) => Array.isArray(rows) && rows.some((r: any) => String(r?.date ?? "").trim().length > 0 || String(r?.event ?? "").trim().length > 0);

  // ── Preliminary nav-dot readiness ──────────────────────────────────────────
  // Parties: every party has a name AND an address (Through is optional).
  const partiesFilled = (rows: any[]) =>
    Array.isArray(rows) && rows.length > 0 && rows.every((r: any) => String(r?.name ?? "").trim().length > 0 && String(r?.address ?? "").trim().length > 0);
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
  // Advocate: name and address are required (firm, enrolment, email, phone optional)
  const prelimAdvocateReady = !!(String(wpAdv?.name ?? "").trim() && String(wpAdv?.address ?? "").trim());
  // Disclosures: main law point is required
  const prelimDisclosuresReady = Boolean(wpDisclosures?.mainLawPoint?.trim());
  // Deponent: everything except "presently at" (location) is mandatory.
  const prelimDeponentReady = (["name", "relationship", "fatherName", "age", "address", "role"] as const)
    .every((k) => String((deponent as any)?.[k] ?? "").trim());

  const active: Record<EditorSection, boolean> = {
    synopsis: !!String(synopsis ?? "").trim(),
    listOfDates: hasLoD(lod),
    reliefs: hasAam(reliefs),
    facts: (factsRowsWatch || []).length > 0 || !!String(facts ?? "").trim(),
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
      <LoDTable hideAnnexures={annexureMode === "facts"} />
    </div>
  );

  const reliefsEditor = (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Single source of truth — all rows (residuary prayer last) print in the top reliefs block, Para 1 (run together inline) and the final Prayers.
          Type each relief&rsquo;s own punctuation (&ldquo;; and&rdquo; between, a full stop after the last) — nothing is added automatically.
        </p>
        <MayurButton section="reliefs" />
      </div>
      <AamTable name="wp.reliefs" />
    </div>
  );

  const factsEditor = (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <MayurButton section="facts" />
      </div>
      <FactsSection />
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

  const editorSectionsList: { id: EditorSection; label: string; active: boolean }[] = [
    { id: "listOfDates", label: "List of Dates", active: active.listOfDates },
    { id: "grounds", label: "Grounds", active: active.grounds },
    { id: "synopsis", label: "Synopsis", active: active.synopsis },
    { id: "facts", label: "Facts", active: active.facts },
    { id: "reliefs", label: "Reliefs", active: active.reliefs },
  ];

  // ── Petition tab (modular 2-pane or 3-pane workspace) ───────────────────────
  const petitionTab = (
    <EditorProvider>
      <div className={cn("flex flex-col", PANEL_H)}>
        <div className="mb-1 flex items-center gap-1.5">
          {/* Panes Switch Button: 1-click toggle between 3 Panes and 2 Panes */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleTogglePaneCount}
            className="h-8 text-xs gap-1.5 px-2.5 font-normal cursor-pointer select-none"
            title={paneCount === 3 ? "Click to switch to 2 Panes" : "Click to switch to 3 Panes"}
          >
            {paneCount === 3 ? (
              <>
                <Columns3 className="h-3.5 w-3.5 text-muted-foreground" />
                <span>3 Panes</span>
              </>
            ) : (
              <>
                <Columns2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span>2 Panes</span>
              </>
            )}
          </Button>

          {/* View Next Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleViewNext}
            className="h-8 text-xs gap-1.5 px-2.5 font-normal cursor-pointer"
            title="Cycle to next set of sections"
          >
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span>View Next</span>
          </Button>

          <div className="flex-grow" />
          <EditorToolbar />
        </div>

        {maximizedPane !== null ? (
          <div className="flex-grow rounded-lg border p-1.5 flex flex-col min-h-0 bg-card">
            <WpPaneHeader
              paneIndex={maximizedPane}
              section={paneSlots[maximizedPane]}
              onSelectSection={(s) => handleSelectPane(maximizedPane, s)}
              sections={editorSectionsList}
              isMaximized={true}
              onToggleMaximize={() => setMaximizedPane(null)}
            />
            <div key={paneSlots[maximizedPane]} className="flex-grow overflow-auto min-h-0 pt-1">
              {editorContent[paneSlots[maximizedPane]]}
            </div>
          </div>
        ) : paneCount === 2 ? (
          <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId="wp-editor-panels-2">
            <ResizablePanel defaultSize={50} minSize={25}>
              <div className="flex flex-col h-full p-1.5">
                <WpPaneHeader
                  paneIndex={0}
                  section={paneSlots[0]}
                  onSelectSection={(s) => handleSelectPane(0, s)}
                  sections={editorSectionsList}
                  isMaximized={false}
                  onToggleMaximize={() => setMaximizedPane(0)}
                />
                <div key={paneSlots[0]} className="flex-grow overflow-auto min-h-0 pt-1">
                  {editorContent[paneSlots[0]]}
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={25}>
              <div className="flex flex-col h-full p-1.5">
                <WpPaneHeader
                  paneIndex={1}
                  section={paneSlots[1]}
                  onSelectSection={(s) => handleSelectPane(1, s)}
                  sections={editorSectionsList}
                  isMaximized={false}
                  onToggleMaximize={() => setMaximizedPane(1)}
                />
                <div key={paneSlots[1]} className="flex-grow overflow-auto min-h-0 pt-1">
                  {editorContent[paneSlots[1]]}
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId="wp-editor-panels-3">
            <ResizablePanel defaultSize={48} minSize={20}>
              <div className="flex flex-col h-full p-1.5">
                <WpPaneHeader
                  paneIndex={0}
                  section={paneSlots[0]}
                  onSelectSection={(s) => handleSelectPane(0, s)}
                  sections={editorSectionsList}
                  isMaximized={false}
                  onToggleMaximize={() => setMaximizedPane(0)}
                />
                <div key={paneSlots[0]} className="flex-grow overflow-auto min-h-0 pt-1">
                  {editorContent[paneSlots[0]]}
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={32} minSize={20}>
              <div className="flex flex-col h-full p-1.5">
                <WpPaneHeader
                  paneIndex={1}
                  section={paneSlots[1]}
                  onSelectSection={(s) => handleSelectPane(1, s)}
                  sections={editorSectionsList}
                  isMaximized={false}
                  onToggleMaximize={() => setMaximizedPane(1)}
                />
                <div key={paneSlots[1]} className="flex-grow overflow-auto min-h-0 pt-1">
                  {editorContent[paneSlots[1]]}
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={20} minSize={15}>
              <div className="flex flex-col h-full p-1.5">
                <WpPaneHeader
                  paneIndex={2}
                  section={paneSlots[2]}
                  onSelectSection={(s) => handleSelectPane(2, s)}
                  sections={editorSectionsList}
                  isMaximized={false}
                  onToggleMaximize={() => setMaximizedPane(2)}
                />
                <div key={paneSlots[2]} className="flex-grow overflow-auto min-h-0 pt-1">
                  {editorContent[paneSlots[2]]}
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </EditorProvider>
  );

  // ── Preliminary content ─────────────────────────────────────────────────────
  // The line under the name means different things on the two sides: a
  // petitioner describes themselves, a respondent is served through an officer.
  const petitionerThrough = 'E.g., working as Senior Accounts Officer (Group-A)';
  const respondentThrough = 'E.g., "Through the Secretary, Ministry of Home Affairs"';
  const partiesContent = (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Memo of Parties</span>
        <MayurButton section="parties" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div><p className="mb-1 text-xs font-medium">{countParties(petitioners) > 1 ? "Petitioners" : "Petitioner"}</p><VaadiTable name="petitioners" showPosition={false} showThrough throughPlaceholder={petitionerThrough} compactAdd /></div>
        <div><p className="mb-1 text-xs font-medium">{countParties(respondents) > 1 ? "Respondents" : "Respondent"}</p><VaadiTable name="respondents" showPosition={false} showThrough throughPlaceholder={respondentThrough} compactAdd /></div>
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
      <div className="mb-1 flex w-full items-center justify-end gap-1.5">
        <MayurButton section="deponent" />
        <UseFirstPartyButton />
      </div>
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
  const handleResetAdvocateToDefaults = () => {
    const fb = getWpFiledBy();
    form.setValue("wp.advocate.name", fb.name, { shouldDirty: true });
    form.setValue("wp.advocate.firm", fb.firm, { shouldDirty: true });
    form.setValue("wp.advocate.address", fb.address, { shouldDirty: true });
    form.setValue("wp.advocate.enrolmentNo", fb.enrolmentNo, { shouldDirty: true });
    form.setValue("wp.advocate.email", fb.email, { shouldDirty: true });
    form.setValue("wp.advocate.phone", fb.phone, { shouldDirty: true });
  };

  const advocateContent = (
    <div className="space-y-4 max-w-2xl text-xs">
      <div className="flex items-center justify-between pb-2 border-b">
        <div>
          <h3 className="font-semibold text-sm">Advocate Details (&ldquo;Filed by&rdquo; Block)</h3>
          <p className="text-muted-foreground text-xs">
            These details appear on the &ldquo;Filed by&rdquo; table at the foot of every writ component and on the Vakalatnama.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleResetAdvocateToDefaults}
          className="text-xs h-7"
          title="Reset to default details configured in Settings → Writ Petition (DHC)"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Reset to Settings Defaults
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FormField control={form.control} name="wp.advocate.name" render={({ field }) => (
          <FormItem><Field label="Advocate Name *"><Input {...field} placeholder="e.g. Adv. Jane Doe" className="h-8 text-xs" /></Field></FormItem>
        )} />
        <FormField control={form.control} name="wp.advocate.firm" render={({ field }) => (
          <FormItem><Field label="Firm / Chamber Name"><Input {...field} placeholder="e.g. Legal Associates" className="h-8 text-xs" /></Field></FormItem>
        )} />
        <FormField control={form.control} name="wp.advocate.enrolmentNo" render={({ field }) => (
          <FormItem><Field label="Enrolment No."><Input {...field} placeholder="e.g. D/1234/2015" className="h-8 text-xs" /></Field></FormItem>
        )} />
        <FormField control={form.control} name="wp.advocate.phone" render={({ field }) => (
          <FormItem><Field label="Phone No."><Input {...field} placeholder="e.g. +91 98765 43210" className="h-8 text-xs" /></Field></FormItem>
        )} />
        <FormField control={form.control} name="wp.advocate.email" render={({ field }) => (
          <FormItem className="md:col-span-2"><Field label="Email Address"><Input {...field} placeholder="e.g. advocate@example.com" className="h-8 text-xs" /></Field></FormItem>
        )} />
        <FormField control={form.control} name="wp.advocate.address" render={({ field }) => (
          <FormItem className="md:col-span-2"><Field label="Chamber / Office Address *"><Textarea {...field} rows={2} placeholder="e.g. Chamber No. 123, Delhi High Court, New Delhi - 110003" className="text-xs" /></Field></FormItem>
        )} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t">
        <FormField control={form.control} name="advocate.filingPlace" render={({ field }) => (
          <FormItem><Field label="Filing Place"><Input {...field} placeholder="New Delhi" className="h-8 text-xs" /></Field></FormItem>
        )} />
        <FormField control={form.control} name="advocate.filingDate" render={({ field }) => (
          <FormItem><Field label="Filing Date"><DateInput value={field.value as Date} onChange={field.onChange} /></Field></FormItem>
        )} />
      </div>
    </div>
  );

  const disclosuresContent = (
    <div className="space-y-4 max-w-3xl text-xs">
      <div className="flex items-center justify-between pb-2 border-b">
        <div>
          <h3 className="font-semibold text-sm">Index Disclosures & Notes</h3>
          <p className="text-muted-foreground text-xs">
            Mandatory disclosures required to be printed immediately below the Index table as per Delhi High Court Practice Directions (Circular No. 201/Rules/DHC).
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* (i) Main Law Point & Page/Para */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-2.5 rounded-lg border bg-muted/20">
          <div className="md:col-span-2">
            <FormField
              control={form.control}
              name="wp.indexDisclosures.mainLawPoint"
              render={({ field }) => (
                <FormItem>
                  <Field label="Note (i): Main question of law involved *" hint="Formulate the core legal issue raised in the writ">
                    <Textarea
                      {...field}
                      rows={2}
                      placeholder="e.g. Whether an order of termination passed in violation of natural justice without an inquiry is void ab initio..."
                      className="text-xs"
                    />
                  </Field>
                </FormItem>
              )}
            />
          </div>
          <div>
            <FormField
              control={form.control}
              name="wp.indexDisclosures.lawPointPageAndPara"
              render={({ field }) => (
                <FormItem>
                  <Field label="Page No. & Para" hint="Where formulated in petition">
                    <Input {...field} placeholder="e.g. Page 14, Ground A" className="h-8 text-xs" />
                  </Field>
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* (ii) Relevant Statutes */}
        <div className="p-2.5 rounded-lg border bg-muted/20">
          <FormField
            control={form.control}
            name="wp.indexDisclosures.relevantStatutes"
            render={({ field }) => (
              <FormItem>
                <Field label="Note (ii): Relevant enactment / statutes involved" hint="Key statutory enactments or rules governing the dispute">
                  <Input {...field} placeholder="Constitution of India, Article 226" className="h-8 text-xs" />
                </Field>
              </FormItem>
            )}
          />
        </div>

        {/* (iii) Previous Case Details */}
        <div className="p-2.5 rounded-lg border bg-muted/20">
          <FormField
            control={form.control}
            name="wp.indexDisclosures.previousCaseDetails"
            render={({ field }) => (
              <FormItem>
                <Field label="Note (iii): Particulars of any previous / pending case between the parties" hint="Provide case number and court/tribunal, or leave as 'None'">
                  <Input {...field} placeholder="None" className="h-8 text-xs" />
                </Field>
              </FormItem>
            )}
          />
        </div>

        {/* (iv) Caveat Notice */}
        <div className="p-2.5 rounded-lg border bg-muted/20 space-y-2">
          <FormField
            control={form.control}
            name="wp.indexDisclosures.caveatReceived"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox id="wp-caveat" checked={field.value} onCheckedChange={field.onChange} />
                <label htmlFor="wp-caveat" className="text-xs font-medium cursor-pointer">
                  Note (iv): Caveat notice received from respondent(s)
                </label>
              </div>
            )}
          />
          {form.watch("wp.indexDisclosures.caveatReceived") && (
            <FormField
              control={form.control}
              name="wp.indexDisclosures.caveatDetails"
              render={({ field }) => (
                <FormItem>
                  <Field label="Caveat Details & Proof of Service" hint="Caveat number, date served, and compliance">
                    <Input {...field} placeholder="e.g. Caveat No. 123/2026 served on 10.09.2026; copy supplied" className="h-8 text-xs" />
                  </Field>
                </FormItem>
              )}
            />
          )}
        </div>

        {/* (v) Alternative Remedy */}
        <div className="p-2.5 rounded-lg border bg-muted/20 space-y-2">
          <FormField
            control={form.control}
            name="wp.indexDisclosures.hasAlternativeRemedy"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox id="wp-alt-rem" checked={field.value} onCheckedChange={field.onChange} />
                <label htmlFor="wp-alt-rem" className="text-xs font-medium cursor-pointer">
                  Note (v): An alternative statutory remedy is available to the petitioner
                </label>
              </div>
            )}
          />
          <FormField
            control={form.control}
            name="wp.indexDisclosures.alternativeRemedyDetails"
            render={({ field }) => (
              <FormItem>
                <Field
                  label={form.watch("wp.indexDisclosures.hasAlternativeRemedy") ? "Reasons why alternative remedy is not efficacious / bypassed" : "Statement on alternative statutory remedy"}
                  hint="Rule 1 of Practice Directions: This statement is also reproduced in the petition body"
                >
                  <Textarea {...field} rows={2} placeholder="The Petitioner has no efficacious alternative statutory remedy available under law." className="text-xs" />
                </Field>
              </FormItem>
            )}
          />
        </div>

        {/* (vi) Constitutional / Statutory Validity */}
        <div className="p-2.5 rounded-lg border bg-muted/20 space-y-2">
          <FormField
            control={form.control}
            name="wp.indexDisclosures.constitutionalValidityChallenged"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox id="wp-const-validity" checked={field.value} onCheckedChange={field.onChange} />
                <label htmlFor="wp-const-validity" className="text-xs font-medium cursor-pointer">
                  Note (vi): Constitutional validity of any Act, Rule, Regulation or Bye-law is challenged
                </label>
              </div>
            )}
          />
          {form.watch("wp.indexDisclosures.constitutionalValidityChallenged") && (
            <FormField
              control={form.control}
              name="wp.indexDisclosures.constitutionalValidityDetails"
              render={({ field }) => (
                <FormItem>
                  <Field label="Provisions Challenged & Notice Details" hint="Specify statutory provision and whether notice to AG / ASG is required">
                    <Input {...field} placeholder="e.g. Challenge to Section 10(2) of XYZ Act; notice to Attorney General required" className="h-8 text-xs" />
                  </Field>
                </FormItem>
              )}
            />
          )}
        </div>

        {/* (vii) Advance Service to Nominated Counsel / Standing Counsel */}
        <div className="p-2.5 rounded-lg border bg-muted/20 space-y-2">
          <FormField
            control={form.control}
            name="wp.indexDisclosures.copySuppliedToOfficialRespondents"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox id="wp-copy-supplied" checked={field.value} onCheckedChange={field.onChange} />
                <label htmlFor="wp-copy-supplied" className="text-xs font-medium cursor-pointer">
                  Note (vii): Advance copy served on nominated counsel / Standing Counsel for Government / authorities
                </label>
              </div>
            )}
          />
          <FormField
            control={form.control}
            name="wp.indexDisclosures.copySuppliedDetails"
            render={({ field }) => (
              <FormItem>
                <Field label="Service / Portal Details (Optional)" hint="e.g. Served on Standing Counsel (Civil), GNCTD / Delhi HC e-service portal">
                  <Input {...field} placeholder="e.g. Served via Delhi HC e-filing portal" className="h-8 text-xs" />
                </Field>
              </FormItem>
            )}
          />
        </div>

        {/* (viii) MP / MLA Involvement */}
        <div className="p-2.5 rounded-lg border bg-muted/20 space-y-2">
          <FormField
            control={form.control}
            name="wp.indexDisclosures.mpMlaInvolved"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox id="wp-mp-mla" checked={field.value} onCheckedChange={field.onChange} />
                <label htmlFor="wp-mp-mla" className="text-xs font-medium cursor-pointer">
                  Note (viii): Matter involves sitting / former Member of Parliament (MP) or Member of Legislative Assembly (MLA)
                </label>
              </div>
            )}
          />
          {form.watch("wp.indexDisclosures.mpMlaInvolved") && (
            <FormField
              control={form.control}
              name="wp.indexDisclosures.mpMlaDetails"
              render={({ field }) => (
                <FormItem>
                  <Field label="MP / MLA Details" hint="Name, constituency, and role in petition">
                    <Input {...field} placeholder="e.g. Respondent No. 3 is sitting MLA from..." className="h-8 text-xs" />
                  </Field>
                </FormItem>
              )}
            />
          )}
        </div>

        {/* (ix) Soft & Hard Copy Identity Certificate */}
        <div className="p-2.5 rounded-lg border bg-muted/20">
          <FormField
            control={form.control}
            name="wp.indexDisclosures.hardAndSoftCopySame"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox id="wp-copy-cert" checked={field.value} onCheckedChange={field.onChange} />
                <label htmlFor="wp-copy-cert" className="text-xs font-medium cursor-pointer">
                  Note (ix): Certified that soft copy and hard copy filed before the Court are identical in all respects
                </label>
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );

  const prelimContent = { parties: partiesContent, details: detailsContent, disclosures: disclosuresContent, advocate: advocateContent, deponent: deponentContent }[prelim];

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
      <div className="flex items-center justify-between gap-2">
        {cmToggle("wp.cms.stay.active", "cm-stay", "Include a CM for Stay of the impugned order")}
        <MayurButton section="cm:stay" />
      </div>
      {cmTitle("wp.cms.stay.title", WP_STD_CM_TITLES.stay)}
      {cmBody("wp.cms.stay.body")}
      {cmPrayers("wp.cms.stay.prayers")}
    </div>
  );
  const lengthyContent = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {cmToggle("wp.cms.lengthySynopsis.active", "cm-syn", "Include a CM seeking permission to file a lengthy Synopsis & List of Dates")}
        <MayurButton section="cm:lengthySynopsis" />
      </div>
      {cmTitle("wp.cms.lengthySynopsis.title", WP_STD_CM_TITLES.lengthySynopsis)}
      {cmBody("wp.cms.lengthySynopsis.body")}
      {cmPrayers("wp.cms.lengthySynopsis.prayers")}
    </div>
  );
  const exemptionContent = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {cmToggle("wp.cms.exemptionCopies.active", "cm-exempt", "Include a CM for exemption from filing certified / legible / true-typed copies")}
        <MayurButton section="cm:exemptionCopies" />
      </div>
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
        : <div className="space-y-3">{customCms.fields.map((f, i) => (
            <div key={f.id} className="space-y-1">
              <div className="flex items-center justify-end">
                <MayurButton section={`cm:custom:${i}`} label={`Custom CM #${i + 1}`} />
              </div>
              <CustomIaCard index={i} basePath={`wp.customCms.${i}`} para2Label="This application is being filed praying that…" onRemove={() => customCms.remove(i)} />
            </div>
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
            { id: "disclosures", label: "Index Disclosures", active: prelimDisclosuresReady },
            { id: "advocate", label: "Advocate Details", active: prelimAdvocateReady },
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
