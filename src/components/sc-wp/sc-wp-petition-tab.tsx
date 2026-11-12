"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useStickyState } from "@/hooks/useStickyState";
import type { DraftoProject } from "@/lib/schema";
import { cn } from "@/lib/utils";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { LoDTable } from "@/components/custom/lod-table";
import { AamTable } from "@/components/custom/aam-table";
import { AppendixContent } from "@/components/dialogs/appendix-dialog";
import { appendixHasContent } from "@/lib/appendix";
import { EditorToolbar } from "@/components/custom/editor-toolbar";
import { EditorProvider } from "@/components/custom/editor-provider";
import { BadhiyaBox } from "@/components/custom/badhiya-box";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSettings } from "@/components/dialogs/settings-dialog";
import { Columns2, Columns3, Sparkles, ListPlus, Maximize2, Minimize2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FactsSection } from "@/components/custom/facts-section";
import { isPil } from "@/lib/court-family";
import { MayurButton } from "@/components/custom/mayur-button";

type ScWpPetitionSection = 'synopsis' | 'listOfDates' | 'reliefs' | 'facts' | 'grounds' | 'appendix';
const EDITOR_SECTIONS: ScWpPetitionSection[] = ['synopsis', 'listOfDates', 'reliefs', 'facts', 'grounds', 'appendix'];

const RESIDUAL_PRAYER = "Pass any such other order(s) as this Hon'ble Court may deem fit in the facts and circumstances of this case.";

function ScWpPaneHeader({
  paneIndex,
  section,
  onSelectSection,
  sections,
  isMaximized,
  onToggleMaximize,
}: {
  paneIndex: number;
  section: ScWpPetitionSection;
  onSelectSection: (section: ScWpPetitionSection) => void;
  sections: { id: ScWpPetitionSection; label: string; active: boolean }[];
  isMaximized: boolean;
  onToggleMaximize: () => void;
}) {
  const current = sections.find((s) => s.id === section);
  const mayurSecMap: Record<ScWpPetitionSection, string> = {
    synopsis: "synopsis",
    listOfDates: "lod",
    reliefs: "reliefs",
    facts: "facts",
    grounds: "grounds",
    appendix: "",
  };

  return (
    <div className="flex items-center justify-between gap-1 pb-1 mb-1 border-b border-border/50 shrink-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <Select value={section} onValueChange={(v) => onSelectSection(v as ScWpPetitionSection)}>
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

export function ScWpPetitionTab() {
  const form = useFormContext<DraftoProject>();

  // Ensure residual prayer exists in wp.reliefs
  useEffect(() => {
    const currentReliefs = form.getValues("wp.reliefs") || [];
    if (currentReliefs.length === 0) {
      form.setValue("wp.reliefs", [
        { id: `r_${Date.now()}_1`, particulars: "" },
        { id: `r_${Date.now()}_2`, particulars: RESIDUAL_PRAYER }
      ], { shouldDirty: true });
    } else if (!currentReliefs.some((r: any) => (r.particulars || "").trim().toLowerCase().startsWith("pass any such other"))) {
      form.setValue("wp.reliefs", [
        ...currentReliefs,
        { id: `r_${Date.now()}_res`, particulars: RESIDUAL_PRAYER }
      ], { shouldDirty: true });
    }
  }, [form]);

  const annexureMode = useWatch({ control: form.control, name: 'wp.annexureMode' as any }) || 'lod';
  const factsRowsWatch = useWatch({ control: form.control, name: 'wp.factsRows' as any });

  // Modular 2-pane / 3-pane state for SC Writ Petitions
  const defaultScWpSlots: [ScWpPetitionSection, ScWpPetitionSection, ScWpPetitionSection] = [
    'listOfDates',
    'grounds',
    'synopsis',
  ];

  const [paneCount, setPaneCount] = useStickyState<2 | 3>('sc-wp-tab-pane-count', getSettings().defaultPanes ?? 3);
  const [paneSlots, setPaneSlots] = useStickyState<[ScWpPetitionSection, ScWpPetitionSection, ScWpPetitionSection]>(
    'sc-wp-tab-pane-slots',
    defaultScWpSlots
  );
  const [maximizedPane, setMaximizedPane] = useState<number | null>(null);

  // Sequences for "View Next" cycling (6 sections)
  const twoPaneSets: [ScWpPetitionSection, ScWpPetitionSection][] = useMemo(() => [
    ['listOfDates', 'synopsis'],
    ['grounds', 'facts'],
    ['reliefs', 'appendix'],
  ], []);

  const threePaneSets: [ScWpPetitionSection, ScWpPetitionSection, ScWpPetitionSection][] = useMemo(() => [
    ['listOfDates', 'grounds', 'synopsis'],
    ['facts', 'reliefs', 'appendix'],
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

  const handleSelectPane = (paneIndex: number, newSection: ScWpPetitionSection) => {
    setPaneSlots((prev) => {
      const next = [...prev] as [ScWpPetitionSection, ScWpPetitionSection, ScWpPetitionSection];
      const maxSlots = paneCount;
      const existingIndex = next.slice(0, maxSlots).findIndex((s, idx) => s === newSection && idx !== paneIndex);
      if (existingIndex !== -1) {
        next[existingIndex] = next[paneIndex];
      }
      next[paneIndex] = newSection;
      return next;
    });
  };

  // Dot watches
  const synopsis = useWatch({ control: form.control, name: 'synopsis' });
  const lod = useWatch({ control: form.control, name: 'listOfDates' });
  const reliefs = useWatch({ control: form.control, name: 'wp.reliefs' });
  const facts = useWatch({ control: form.control, name: 'wp.facts' });
  // A PIL must state the public injury it alleges; it prints as Para 3.
  const scWpPetCourtType = useWatch({ control: form.control, name: 'courtType' });
  const isPilProject = isPil(scWpPetCourtType);
  const grounds = useWatch({ control: form.control, name: 'grounds' });
  const wantsAppendix = useWatch({ control: form.control, name: 'wantsAppendix' });
  const appendixItems = useWatch({ control: form.control, name: 'appendixItems' });
  const factsLodIds = useWatch({ control: form.control, name: 'wp.factsLodIds' });

  const hasAamRow = (rows: any[]) => Array.isArray(rows) && rows.some((r: any) => String(r?.particulars ?? "").trim().length > 0);
  const hasLoDRow = (rows: any[]) => Array.isArray(rows) && rows.some((r: any) => String(r?.date ?? "").trim().length > 0 || String(r?.event ?? "").trim().length > 0);

  const synopsisActive = !!String(synopsis ?? "").trim();
  const lodActive = hasLoDRow(lod);
  const reliefsActive = hasAamRow(reliefs);
  const factsActive = (factsRowsWatch || []).length > 0 || !!String(facts ?? "").trim();
  const groundsActive = hasAamRow(grounds);
  const appendixRows = (appendixItems ?? []) as any[];
  const appendixActive = appendixRows.length === 0 || appendixRows.every(appendixHasContent);

  // Section Editors
  const synopsisEditor = (
    <FormField
      control={form.control}
      name="synopsis"
      render={({ field }) => (
        <FormItem className="h-full flex flex-col">
          <FormControl>
            <BadhiyaBox value={field.value} onChange={field.onChange} path={field.name} />
          </FormControl>
        </FormItem>
      )}
    />
  );

  const lodEditor = (
    <div className="space-y-2 h-full flex flex-col">
      <p className="text-xs text-muted-foreground">
        Chronology of events with attached annexures. In Writ Petitions, annexure sentences appear only in the Facts section, while Impugned Orders (marked IO) appear in Paragraph 1.
      </p>
      <div className="flex-grow overflow-auto">
        <LoDTable hideAnnexures={annexureMode === "facts"} />
      </div>
    </div>
  );

  const reliefsEditor = (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Single source of truth — all rows (residuary prayer last) print in Paragraph 1 (run together inline) and Paragraph 8 (final Prayers).
        Type each relief&rsquo;s own punctuation (&ldquo;; and&rdquo; between, a full stop after the last).
      </p>
      <AamTable name="wp.reliefs" />
    </div>
  );

  const factsEditor = (
    <div className="flex h-full flex-col gap-2">
      {isPilProject && (
        <FormField
          control={form.control}
          name="pil.injuryToPublic"
          render={({ field }) => (
            <FormItem className="flex flex-col space-y-1">
              <p className="text-xs font-medium">Nature of injury caused or likely to be caused to the public:</p>
              <FormControl>
                <div className="h-28">
                  <BadhiyaBox value={field.value} onChange={field.onChange} path={field.name} />
                </div>
              </FormControl>
            </FormItem>
          )}
        />
      )}
      <FactsSection
        factsPath="wp.factsRows"
        annexureModePath="wp.annexureMode"
        storedFactsPath="wp.facts"
      />
    </div>
  );

  const groundsEditor = <AamTable name="grounds" defaultRows={10} allowHeadings />;

  const editorSectionsList: { id: ScWpPetitionSection; label: string; active: boolean }[] = [
    { id: 'listOfDates', label: 'List of Dates', active: lodActive },
    { id: 'grounds', label: 'Grounds', active: groundsActive },
    { id: 'synopsis', label: 'Synopsis', active: synopsisActive },
    { id: 'facts', label: 'Facts', active: factsActive },
    { id: 'reliefs', label: 'Relief(s)', active: reliefsActive },
    { id: 'appendix', label: 'Appendix', active: appendixActive },
  ];

  const renderSectionContent = (sec: ScWpPetitionSection) => {
    switch (sec) {
      case 'synopsis': return synopsisEditor;
      case 'listOfDates': return lodEditor;
      case 'reliefs': return reliefsEditor;
      case 'facts': return factsEditor;
      case 'grounds': return groundsEditor;
      case 'appendix': return <AppendixContent />;
      default: return null;
    }
  };

  return (
    <EditorProvider>
      <div className="flex flex-col h-[calc(100vh-160px)]">
        <div className="flex items-center gap-1.5 mb-1">
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

          <div className="flex-grow"></div>
          <EditorToolbar />
        </div>

        {maximizedPane !== null ? (
          <div className="flex-grow rounded-lg border p-1.5 flex flex-col min-h-0 bg-card">
            <ScWpPaneHeader
              paneIndex={maximizedPane}
              section={paneSlots[maximizedPane]}
              onSelectSection={(s) => handleSelectPane(maximizedPane, s)}
              sections={editorSectionsList}
              isMaximized={true}
              onToggleMaximize={() => setMaximizedPane(null)}
            />
            <div key={paneSlots[maximizedPane]} className="flex-grow overflow-auto min-h-0 pt-1">
              {renderSectionContent(paneSlots[maximizedPane])}
            </div>
          </div>
        ) : paneCount === 2 ? (
          <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId="sc-wp-petition-panels-2">
            <ResizablePanel defaultSize={50} minSize={25}>
              <div className="flex flex-col h-full p-1.5">
                <ScWpPaneHeader
                  paneIndex={0}
                  section={paneSlots[0]}
                  onSelectSection={(s) => handleSelectPane(0, s)}
                  sections={editorSectionsList}
                  isMaximized={false}
                  onToggleMaximize={() => setMaximizedPane(0)}
                />
                <div key={paneSlots[0]} className="flex-grow overflow-auto min-h-0 pt-1">
                  {renderSectionContent(paneSlots[0])}
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={25}>
              <div className="flex flex-col h-full p-1.5">
                <ScWpPaneHeader
                  paneIndex={1}
                  section={paneSlots[1]}
                  onSelectSection={(s) => handleSelectPane(1, s)}
                  sections={editorSectionsList}
                  isMaximized={false}
                  onToggleMaximize={() => setMaximizedPane(1)}
                />
                <div key={paneSlots[1]} className="flex-grow overflow-auto min-h-0 pt-1">
                  {renderSectionContent(paneSlots[1])}
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId="sc-wp-petition-panels-3">
            <ResizablePanel defaultSize={48} minSize={20}>
              <div className="flex flex-col h-full p-1.5">
                <ScWpPaneHeader
                  paneIndex={0}
                  section={paneSlots[0]}
                  onSelectSection={(s) => handleSelectPane(0, s)}
                  sections={editorSectionsList}
                  isMaximized={false}
                  onToggleMaximize={() => setMaximizedPane(0)}
                />
                <div key={paneSlots[0]} className="flex-grow overflow-auto min-h-0 pt-1">
                  {renderSectionContent(paneSlots[0])}
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={32} minSize={20}>
              <div className="flex flex-col h-full p-1.5">
                <ScWpPaneHeader
                  paneIndex={1}
                  section={paneSlots[1]}
                  onSelectSection={(s) => handleSelectPane(1, s)}
                  sections={editorSectionsList}
                  isMaximized={false}
                  onToggleMaximize={() => setMaximizedPane(1)}
                />
                <div key={paneSlots[1]} className="flex-grow overflow-auto min-h-0 pt-1">
                  {renderSectionContent(paneSlots[1])}
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={20} minSize={15}>
              <div className="flex flex-col h-full p-1.5">
                <ScWpPaneHeader
                  paneIndex={2}
                  section={paneSlots[2]}
                  onSelectSection={(s) => handleSelectPane(2, s)}
                  sections={editorSectionsList}
                  isMaximized={false}
                  onToggleMaximize={() => setMaximizedPane(2)}
                />
                <div key={paneSlots[2]} className="flex-grow overflow-auto min-h-0 pt-1">
                  {renderSectionContent(paneSlots[2])}
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </EditorProvider>
  );
}
