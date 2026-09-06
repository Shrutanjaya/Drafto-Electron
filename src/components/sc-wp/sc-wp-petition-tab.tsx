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
import { AppendixDialog, AppendixContent } from "@/components/dialogs/appendix-dialog";
import { appendixHasContent } from "@/lib/appendix";
import { EditorToolbar } from "@/components/custom/editor-toolbar";
import { EditorProvider } from "@/components/custom/editor-provider";
import { BadhiyaBox } from "@/components/custom/badhiya-box";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import { SectionDialog } from "@/components/custom/section-dialog";
import { getSettings } from "@/components/dialogs/settings-dialog";
import { Columns2, LayoutList, Sparkles, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { transposeLodToFacts, transposableLodIds, lodFingerprint, appendNewLodRowsToFacts } from "@/lib/wp/wp-facts";

type ScWpPetitionSection = 'synopsis' | 'listOfDates' | 'reliefs' | 'facts' | 'grounds' | 'appendix';
const EDITOR_SECTIONS: ScWpPetitionSection[] = ['synopsis', 'listOfDates', 'reliefs', 'facts', 'grounds', 'appendix'];

const RESIDUAL_PRAYER = "Pass any such other order(s) as this Hon'ble Court may deem fit in the facts and circumstances of this case.";

function ViewToggle({ mode, onChange }: { mode: 'splitter' | 'navigation'; onChange: (m: 'splitter' | 'navigation') => void }) {
  return (
    <div data-ro-nav className="flex items-center rounded-md border overflow-hidden">
      <button
        type="button"
        title="Splitter view"
        onClick={() => onChange('splitter')}
        className={cn(
          "flex items-center gap-1 px-2 py-1 text-xs transition-colors",
          mode === 'splitter'
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
      >
        <Columns2 className="h-3 w-3" />
        Split
      </button>
      <button
        type="button"
        title="Navigation view"
        onClick={() => onChange('navigation')}
        className={cn(
          "flex items-center gap-1 px-2 py-1 text-xs transition-colors border-l",
          mode === 'navigation'
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
      >
        <LayoutList className="h-3 w-3" />
        Nav
      </button>
    </div>
  );
}

function NavRow({ label, active, selected, onClick }: { label: string; active: boolean; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-ro-nav
      onClick={onClick}
      className={cn(
        "w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2",
        selected ? "bg-primary text-primary-foreground dark:text-white" : "hover:bg-muted text-foreground"
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

  // Facts generation logic
  const generatingFacts = useRef(false);
  const handleGenerateFacts = () => {
    const proj = { ...form.getValues(), courtType: "WritPetitionSC" as const };
    if (proj.wp?.factsEdited && (proj.wp?.facts || "").trim()) {
      if (!window.confirm("Replace the current (edited) Facts with a fresh transposition from the List of Dates?")) return;
    }
    generatingFacts.current = true;
    form.setValue("wp.facts", transposeLodToFacts(proj, "P"), { shouldDirty: true });
    form.setValue("wp.factsEdited", false);
    form.setValue("wp.factsLodIds", transposableLodIds(proj));
    form.setValue("wp.factsLodFingerprint", lodFingerprint(proj));
  };

  const handleAppendNewRows = () => {
    const proj = { ...form.getValues(), courtType: "WritPetitionSC" as const };
    const { html, appendedIds } = appendNewLodRowsToFacts(proj, proj.wp?.facts || "", proj.wp?.factsLodIds || [], "P");
    if (appendedIds.length === 0) return;
    generatingFacts.current = true;
    form.setValue("wp.facts", html, { shouldDirty: true });
    form.setValue("wp.factsLodIds", [...(proj.wp?.factsLodIds || []), ...appendedIds]);
    form.setValue("wp.factsLodFingerprint", lodFingerprint(proj));
  };

  // View mode + sticky section
  const [viewMode, setViewMode] = useStickyState<'splitter' | 'navigation'>('sc-wp-petition-tab-view', getSettings().slpTabView ?? 'splitter');
  const [selectedSection, setSelectedSection] = useStickyState<ScWpPetitionSection>('sc-wp-petition-tab-section', 'synopsis');

  // Dot watches
  const synopsis = useWatch({ control: form.control, name: 'synopsis' });
  const lod = useWatch({ control: form.control, name: 'listOfDates' });
  const reliefs = useWatch({ control: form.control, name: 'wp.reliefs' });
  const facts = useWatch({ control: form.control, name: 'wp.facts' });
  const grounds = useWatch({ control: form.control, name: 'grounds' });
  const wantsAppendix = useWatch({ control: form.control, name: 'wantsAppendix' });
  const appendixItems = useWatch({ control: form.control, name: 'appendixItems' });
  const factsLodIds = useWatch({ control: form.control, name: 'wp.factsLodIds' });

  const hasAamRow = (rows: any[]) => rows?.some((r: any) => r.particulars?.trim()) ?? false;
  const hasLoDRow = (rows: any[]) => rows?.some((r: any) => r.date?.trim() || r.event?.trim()) ?? false;

  const synopsisActive = !!synopsis?.trim();
  const lodActive = hasLoDRow(lod);
  const reliefsActive = hasAamRow(reliefs);
  const factsActive = !!facts?.trim();
  const groundsActive = hasAamRow(grounds);
  const appendixRows = (appendixItems ?? []) as any[];
  const appendixActive = !wantsAppendix || (appendixRows.length > 0 && appendixRows.every(appendixHasContent));

  const newLodRowCount = useMemo(() => {
    const done = new Set(factsLodIds || []);
    const proj = { ...form.getValues(), courtType: "WritPetitionSC" as const };
    return transposableLodIds(proj).filter(id => !done.has(id)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lod, factsLodIds]);

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
        <LoDTable />
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
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Transposed from the List of Dates (with annexure sentences). Editing locks it against auto-regeneration.
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {!!facts?.trim() && newLodRowCount > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              title="Add paragraphs for List-of-Dates rows added after the last generation, without touching your edits"
              onClick={handleAppendNewRows}
            >
              <ListPlus className="mr-1 h-3.5 w-3.5" />
              Append {newLodRowCount} new row{newLodRowCount === 1 ? "" : "s"}
            </Button>
          )}
          <Button type="button" size="sm" variant="secondary" onClick={handleGenerateFacts}>
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            Generate from List of Dates
          </Button>
        </div>
      </div>
      <FormField
        control={form.control}
        name="wp.facts"
        render={({ field }) => (
          <FormItem className="flex h-full flex-col flex-grow">
            <FormControl>
              <BadhiyaBox
                value={field.value}
                onChange={(v) => {
                  field.onChange(v);
                  if (!generatingFacts.current) form.setValue("wp.factsEdited", true);
                  generatingFacts.current = false;
                }}
                path={field.name}
              />
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  );

  const groundsEditor = <AamTable name="grounds" defaultRows={10} allowHeadings />;

  if (viewMode === 'navigation') {
    return (
      <EditorProvider>
        <div className="flex flex-col h-[calc(100vh-160px)]">
          <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId="sc-wp-petition-nav-panels">
            <ResizablePanel defaultSize={25} minSize={18} maxSize={40}>
              <div className="flex flex-col h-full p-2 space-y-1">
                <NavRow label="Synopsis" active={synopsisActive} selected={selectedSection === 'synopsis'} onClick={() => setSelectedSection('synopsis')} />
                <NavRow label="List of Dates" active={lodActive} selected={selectedSection === 'listOfDates'} onClick={() => setSelectedSection('listOfDates')} />
                <NavRow label="Relief(s)" active={reliefsActive} selected={selectedSection === 'reliefs'} onClick={() => setSelectedSection('reliefs')} />
                <NavRow label="Facts" active={factsActive} selected={selectedSection === 'facts'} onClick={() => setSelectedSection('facts')} />
                <NavRow label="Grounds" active={groundsActive} selected={selectedSection === 'grounds'} onClick={() => setSelectedSection('grounds')} />
                <NavRow label="Appendix" active={appendixActive} selected={selectedSection === 'appendix'} onClick={() => setSelectedSection('appendix')} />
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={75} minSize={60}>
              <div className="flex flex-col h-full p-2 space-y-2">
                <div className="flex items-center gap-1 shrink-0">
                  <div className="flex-grow"></div>
                  {EDITOR_SECTIONS.includes(selectedSection) && <EditorToolbar />}
                  <ViewToggle mode={viewMode} onChange={setViewMode} />
                </div>
                <div key={selectedSection} className="flex-grow overflow-auto">
                  {selectedSection === 'synopsis' && synopsisEditor}
                  {selectedSection === 'listOfDates' && lodEditor}
                  {selectedSection === 'reliefs' && reliefsEditor}
                  {selectedSection === 'facts' && factsEditor}
                  {selectedSection === 'grounds' && groundsEditor}
                  {selectedSection === 'appendix' && <AppendixContent />}
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </EditorProvider>
    );
  }

  // Splitter view (default)
  return (
    <EditorProvider>
      <div className="flex flex-col h-[calc(100vh-160px)]">
        <div className="flex items-center gap-1 mb-1">
          <SectionDialog label="Relief(s)" title="Relief(s) / Prayers" active={reliefsActive}>
            {reliefsEditor}
          </SectionDialog>
          <SectionDialog label="Facts" title="Facts (transposed from List of Dates)" active={factsActive}>
            <div className="h-[600px] flex flex-col">{factsEditor}</div>
          </SectionDialog>
          <AppendixDialog />
          <div className="flex-grow"></div>
          <EditorToolbar />
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>

        <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId="sc-wp-petition-split-panels">
          <ResizablePanel defaultSize={50}>
            <div className="flex flex-col h-full p-1">
              <h4 className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide mb-1">List of Dates</h4>
              <div className="flex-grow overflow-auto">
                <LoDTable />
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={30}>
            <div className="flex flex-col h-full p-1">
              <h4 className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide mb-1">Grounds</h4>
              <div className="flex-grow overflow-auto">
                <AamTable name="grounds" defaultRows={10} allowHeadings />
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={20}>
            <div className="flex flex-col h-full p-1">
              <h4 className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide mb-1">Synopsis</h4>
              <div className="flex-grow overflow-auto">
                {synopsisEditor}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </EditorProvider>
  );
}
