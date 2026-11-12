
"use client";

import React, { useState, useEffect, useMemo } from "react";
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
import { DeclarationsDialog, DeclarationsContent } from "@/components/dialogs/declarations-dialog";
import { InterimReliefDialog, InterimReliefContent } from "@/components/dialogs/interim-relief-dialog";
import { QuestionsOfLawDialog } from "@/components/dialogs/questions-of-law-dialog";
import { SectionDialog } from "@/components/custom/section-dialog";
import { EditorToolbar } from "../custom/editor-toolbar";
import { EditorProvider } from "@/components/custom/editor-provider";
import { BadhiyaBox } from "../custom/badhiya-box";
import { FormControl, FormField, FormItem } from "../ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { AffidavitDialog } from "../dialogs/affidavit-dialog";
import { VakalatnamaDialog } from "../dialogs/vakalatnama-dialog";
import { getSettings } from "../dialogs/settings-dialog";
import { useCalculatedValues } from "@/hooks/use-calculated-values";
import { Columns2, Columns3, Maximize2, Minimize2, ArrowRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { isAppeal } from "@/lib/court-family";
import { getPartyGrammar, adaptPartyText } from "@/lib/party-grammar";
import { FactsSection } from "@/components/custom/facts-section";
import { FIND_REVEAL_EVENT, getPendingReveal } from "@/lib/find-reveal";
import { MayurButton } from "@/components/custom/mayur-button";

type SlpSection = 'synopsis' | 'listOfDates' | 'facts' | 'grounds' | 'questionsOfLaw' | 'interimRelief' | 'appendix' | 'declarations';
const EDITOR_SECTIONS: SlpSection[] = ['synopsis', 'listOfDates', 'facts', 'grounds', 'questionsOfLaw', 'interimRelief', 'appendix'];




function mayurSectionFor(section: SlpSection): "synopsis" | "lod" | "facts" | "grounds" | "qol" | "interim" | null {
  switch (section) {
    case "synopsis": return "synopsis";
    case "listOfDates": return "lod";
    case "facts": return "facts";
    case "grounds": return "grounds";
    case "questionsOfLaw": return "qol";
    case "interimRelief": return "interim";
    default: return null;
  }
}

function SectionContent({
  section,
  isAppealProject,
  annexureMode,
  factsEditor,
  form,
}: {
  section: SlpSection;
  isAppealProject: boolean;
  annexureMode: string;
  factsEditor: React.ReactNode;
  form: any;
}) {
  switch (section) {
    case 'synopsis':
      return (
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
    case 'listOfDates':
      return (
        <div className="space-y-2">
          <FormField
            control={form.control}
            name="splitSynopsisAndLod"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox id="slp-split" checked={field.value} onCheckedChange={field.onChange} />
                <label htmlFor="slp-split" className="text-xs cursor-pointer">Start List of Dates on a fresh page</label>
              </div>
            )}
          />
          <LoDTable hideAnnexures={isAppealProject && annexureMode === "facts"} />
        </div>
      );
    case 'facts':
      return isAppealProject ? <>{factsEditor}</> : null;
    case 'grounds':
      return <AamTable name="grounds" defaultRows={10} allowHeadings />;
    case 'questionsOfLaw':
      return <AamTable name="questionsOfLaw" defaultRows={10} />;
    case 'interimRelief':
      return !isAppealProject ? <InterimReliefContent /> : null;
    case 'appendix':
      return <AppendixContent />;
    case 'declarations':
      return !isAppealProject ? <DeclarationsContent /> : null;
    default:
      return null;
  }
}

function PaneHeader({
  paneIndex,
  section,
  onSelectSection,
  sections,
  isMaximized,
  onToggleMaximize,
}: {
  paneIndex: number;
  section: SlpSection;
  onSelectSection: (s: SlpSection) => void;
  sections: { id: SlpSection; label: string; active: boolean }[];
  isMaximized: boolean;
  onToggleMaximize: () => void;
}) {
  const current = sections.find((s) => s.id === section);
  const mayurSec = mayurSectionFor(section);

  return (
    <div className="flex items-center justify-between gap-1 mb-1 px-1 py-0.5 border-b pb-1 shrink-0">
      <Select value={section} onValueChange={(val) => onSelectSection(val as SlpSection)}>
        <SelectTrigger className="h-7 border-0 bg-transparent px-1.5 py-0 text-xs font-semibold uppercase tracking-wide text-foreground hover:bg-muted/50 rounded focus:ring-0 gap-1.5 w-auto cursor-pointer">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-2 w-2 rounded-full shrink-0",
                current?.active ? "bg-green-500" : "bg-muted-foreground/30"
              )}
            />
            <SelectValue>{current?.label || section}</SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent>
          {sections.map((s) => (
            <SelectItem key={s.id} value={s.id} className="text-xs cursor-pointer">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full shrink-0",
                    s.active ? "bg-green-500" : "bg-muted-foreground/30"
                  )}
                />
                <span>{s.label}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        {mayurSec && <MayurButton section={mayurSec} />}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
          title={isMaximized ? "Restore 3-pane split" : "Maximize this pane"}
          onClick={onToggleMaximize}
        >
          {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}

export function SlpTab() {
  const form = useFormContext<DraftoProject>();
  const { ioText } = useCalculatedValues();

  // The statutory appeal states its Facts and has no Declarations or Interim
  // Relief. Facts live in the shared `wp.facts` field and are produced by the
  // same engine the writ tools use, with the appeal's A-series prefix.
  const courtType = useWatch({ control: form.control, name: 'courtType' });
  const isAppealProject = isAppeal(courtType);

  const defaultPaneSlots: [SlpSection, SlpSection, SlpSection] = isAppealProject
    ? ['listOfDates', 'grounds', 'facts']
    : ['listOfDates', 'grounds', 'synopsis'];

  const [paneCount, setPaneCount] = useStickyState<2 | 3>('slp-tab-pane-count', getSettings().defaultPanes ?? 3);
  const [paneSlots, setPaneSlots] = useStickyState<[SlpSection, SlpSection, SlpSection]>(
    'slp-tab-pane-slots',
    defaultPaneSlots
  );
  const [maximizedPane, setMaximizedPane] = useState<number | null>(null);

  // Always-on effect: auto-update the "Stay the operation..." prayer text (moved from InterimReliefDialog)
  useEffect(() => {
    const currentPrayers = form.getValues("interimReliefPrayers");
    const newPrayerText = `Stay the operation and effect of ${ioText}`;
    const prayerIndex = currentPrayers.findIndex((p: any) => p.particulars.startsWith("Stay the operation"));
    if (prayerIndex !== -1) {
      const prayerToUpdate = currentPrayers[prayerIndex];
      if (prayerToUpdate.particulars !== newPrayerText) {
        const updatedPrayers = [...currentPrayers];
        updatedPrayers[prayerIndex] = { ...prayerToUpdate, particulars: newPrayerText };
        form.setValue("interimReliefPrayers", updatedPrayers, { shouldDirty: true });
      }
    }
  }, [ioText, form]);

  // Auto-sync unedited preset interim relief grounds between singular/plural when party counts change
  const watchedPetitioners = useWatch({ control: form.control, name: "petitioners" });
  const watchedRespondents = useWatch({ control: form.control, name: "respondents" });
  const watchedCommonParties = useWatch({ control: form.control, name: "commonOrderParties" });
  const watchedIsCommonOrder = useWatch({ control: form.control, name: "isCommonOrder" });
  useEffect(() => {
    const g = getPartyGrammar({
      petitioners: watchedPetitioners,
      respondents: watchedRespondents,
      commonOrderParties: watchedCommonParties,
      isCommonOrder: watchedIsCommonOrder,
      courtType: form.getValues("courtType"),
    });
    const currentGrounds = form.getValues("interimReliefGrounds") || [];
    let changed = false;
    const updated = currentGrounds.map((row: any) => {
      const next = adaptPartyText(row.particulars || "", g);
      if (next !== row.particulars) {
        changed = true;
        return { ...row, particulars: next };
      }
      return row;
    });
    if (changed) {
      form.setValue("interimReliefGrounds", updated, { shouldDirty: true });
    }
  }, [watchedPetitioners, watchedRespondents, watchedCommonParties, watchedIsCommonOrder, form]);

  // Find & Replace navigation: when a match targets a Petition section,
  // ensure that section is mounted in an active slot so the field is revealable.
  useEffect(() => {
    const applyPending = () => {
      const p = getPendingReveal();
      if (p && p.tab === 'slp' && p.section) {
        const sec = p.section as SlpSection;
        setPaneSlots((prev) => {
          if (prev.slice(0, paneCount).includes(sec)) return prev;
          return [sec, prev[1], prev[2]];
        });
        setMaximizedPane(null);
      }
    };
    window.addEventListener(FIND_REVEAL_EVENT, applyPending);
    applyPending();
    return () => window.removeEventListener(FIND_REVEAL_EVENT, applyPending);
  }, [paneCount, setPaneSlots]);

  // Dot-active watches
  const synopsis = useWatch({ control: form.control, name: 'synopsis' });
  const listOfDatesWatch = useWatch({ control: form.control, name: 'listOfDates' });
  const groundsWatch = useWatch({ control: form.control, name: 'grounds' });
  const questionsOfLawWatch = useWatch({ control: form.control, name: 'questionsOfLaw' });
  const wantsInterimRelief = useWatch({ control: form.control, name: 'wantsInterimRelief' });
  const interimReliefPrayersWatch = useWatch({ control: form.control, name: 'interimReliefPrayers' });
  const wantsAppendix = useWatch({ control: form.control, name: 'wantsAppendix' });
  const appendixItems = useWatch({ control: form.control, name: 'appendixItems' });
  const declarationsWatch = useWatch({ control: form.control, name: 'declarations' });
  const aorCertWatch = useWatch({ control: form.control, name: 'aorCertificate' });

  const facts = useWatch({ control: form.control, name: 'wp.facts' });
  const factsRowsWatch = useWatch({ control: form.control, name: 'wp.factsRows' as any });
  const annexureMode = useWatch({ control: form.control, name: 'wp.annexureMode' as any }) || 'lod';
  const factsActive = (factsRowsWatch || []).length > 0 || !!String(facts ?? "").trim();

  const factsEditor = (
    <FactsSection
      factsPath="wp.factsRows"
      annexureModePath="wp.annexureMode"
      storedFactsPath="wp.facts"
    />
  );

  const hasAamRow = (rows: any[]) => Array.isArray(rows) && rows.some((r: any) => String(r?.particulars ?? "").trim().length > 0);
  const hasLoDRow = (rows: any[]) => Array.isArray(rows) && rows.some((r: any) => String(r?.date ?? "").trim().length > 0 || String(r?.event ?? "").trim().length > 0);

  const synopsisActive = !!String(synopsis ?? "").trim();
  const listOfDatesActive = hasLoDRow(listOfDatesWatch);
  const groundsActive = hasAamRow(groundsWatch);
  const questionsOfLawActive = hasAamRow(questionsOfLawWatch);
  const interimReliefActive = !wantsInterimRelief || hasAamRow(interimReliefPrayersWatch);
  // Green once every Appendix row actually has something attached (and there is
  // at least one), or when the Appendix is switched off altogether.
  const appendixRows = (appendixItems ?? []) as any[];
  const appendixActive = appendixRows.length === 0 || appendixRows.every(appendixHasContent);
  const declarationsActive = !!(
    declarationsWatch?.noOtherSLPFiled &&
    declarationsWatch?.annexuresTrueCopies &&
    aorCertWatch?.confinedToPleadings &&
    aorCertWatch?.annexuresNecessary &&
    aorCertWatch?.basedOnInstructions
  );

  const availableSections = useMemo(() => {
    const list: { id: SlpSection; label: string; active: boolean }[] = [
      { id: 'listOfDates', label: 'List of Dates', active: listOfDatesActive },
      { id: 'grounds', label: 'Grounds', active: groundsActive },
      { id: 'synopsis', label: 'Synopsis', active: synopsisActive },
      { id: 'questionsOfLaw', label: 'Questions of Law', active: questionsOfLawActive },
    ];
    if (isAppealProject) {
      list.push({ id: 'facts', label: 'Facts', active: factsActive });
    } else {
      list.push({ id: 'interimRelief', label: 'Interim Relief', active: interimReliefActive });
    }
    list.push({ id: 'appendix', label: 'Appendix', active: appendixActive });
    return list;
  }, [
    listOfDatesActive,
    groundsActive,
    synopsisActive,
    questionsOfLawActive,
    isAppealProject,
    factsActive,
    interimReliefActive,
    appendixActive,
  ]);

  // Sanitize any legacy slot state containing declarations
  useEffect(() => {
    if (paneSlots.includes('declarations')) {
      setPaneSlots((prev) =>
        prev.map((s) => (s === 'declarations' ? 'appendix' : s)) as [SlpSection, SlpSection, SlpSection]
      );
    }
  }, [paneSlots, setPaneSlots]);

  // Sequences for "View Next" cycling (6 modular sections)
  const twoPaneSets: [SlpSection, SlpSection][] = useMemo(() => {
    if (isAppealProject) {
      return [
        ['listOfDates', 'synopsis'],
        ['grounds', 'questionsOfLaw'],
        ['appendix', 'facts'],
      ];
    }
    return [
      ['listOfDates', 'synopsis'],
      ['grounds', 'questionsOfLaw'],
      ['appendix', 'interimRelief'],
    ];
  }, [isAppealProject]);

  const threePaneSets: [SlpSection, SlpSection, SlpSection][] = useMemo(() => {
    if (isAppealProject) {
      return [
        ['listOfDates', 'grounds', 'synopsis'],
        ['questionsOfLaw', 'appendix', 'facts'],
      ];
    }
    return [
      ['listOfDates', 'grounds', 'synopsis'],
      ['questionsOfLaw', 'interimRelief', 'appendix'],
    ];
  }, [isAppealProject]);

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

  const handleSelectPane = (paneIndex: number, newSection: SlpSection) => {
    setPaneSlots((prev) => {
      const next = [...prev] as [SlpSection, SlpSection, SlpSection];
      const maxSlots = paneCount;
      const existingIndex = next.slice(0, maxSlots).findIndex((s, idx) => s === newSection && idx !== paneIndex);
      if (existingIndex !== -1) {
        // Swap slots smoothly!
        next[existingIndex] = next[paneIndex];
      }
      next[paneIndex] = newSection;
      return next;
    });
  };

  // Modular 2-pane or 3-pane workspace
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

          {/* Declarations Dialog Button (SLP only) */}
          {!isAppealProject && (
            <DeclarationsDialog />
          )}

          <div className="flex-grow"></div>
          <EditorToolbar />
        </div>

        {maximizedPane !== null ? (
          <div className="flex-grow rounded-lg border p-1.5 flex flex-col min-h-0 bg-card">
            <PaneHeader
              paneIndex={maximizedPane}
              section={paneSlots[maximizedPane]}
              onSelectSection={(s) => handleSelectPane(maximizedPane, s)}
              sections={availableSections}
              isMaximized={true}
              onToggleMaximize={() => setMaximizedPane(null)}
            />
            <div className="flex-grow overflow-auto min-h-0 pt-1">
              <SectionContent
                section={paneSlots[maximizedPane]}
                isAppealProject={isAppealProject}
                annexureMode={annexureMode}
                factsEditor={factsEditor}
                form={form}
              />
            </div>
          </div>
        ) : paneCount === 2 ? (
          <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId="slp-tab-panels-2">
            <ResizablePanel defaultSize={50} minSize={25}>
              <div className="flex flex-col h-full p-1.5">
                <PaneHeader
                  paneIndex={0}
                  section={paneSlots[0]}
                  onSelectSection={(s) => handleSelectPane(0, s)}
                  sections={availableSections}
                  isMaximized={false}
                  onToggleMaximize={() => setMaximizedPane(0)}
                />
                <div className="flex-grow overflow-auto min-h-0 pt-1">
                  <SectionContent
                    section={paneSlots[0]}
                    isAppealProject={isAppealProject}
                    annexureMode={annexureMode}
                    factsEditor={factsEditor}
                    form={form}
                  />
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={25}>
              <div className="flex flex-col h-full p-1.5">
                <PaneHeader
                  paneIndex={1}
                  section={paneSlots[1]}
                  onSelectSection={(s) => handleSelectPane(1, s)}
                  sections={availableSections}
                  isMaximized={false}
                  onToggleMaximize={() => setMaximizedPane(1)}
                />
                <div className="flex-grow overflow-auto min-h-0 pt-1">
                  <SectionContent
                    section={paneSlots[1]}
                    isAppealProject={isAppealProject}
                    annexureMode={annexureMode}
                    factsEditor={factsEditor}
                    form={form}
                  />
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId="slp-tab-panels-3">
            <ResizablePanel defaultSize={48} minSize={20}>
              <div className="flex flex-col h-full p-1.5">
                <PaneHeader
                  paneIndex={0}
                  section={paneSlots[0]}
                  onSelectSection={(s) => handleSelectPane(0, s)}
                  sections={availableSections}
                  isMaximized={false}
                  onToggleMaximize={() => setMaximizedPane(0)}
                />
                <div className="flex-grow overflow-auto min-h-0 pt-1">
                  <SectionContent
                    section={paneSlots[0]}
                    isAppealProject={isAppealProject}
                    annexureMode={annexureMode}
                    factsEditor={factsEditor}
                    form={form}
                  />
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={32} minSize={20}>
              <div className="flex flex-col h-full p-1.5">
                <PaneHeader
                  paneIndex={1}
                  section={paneSlots[1]}
                  onSelectSection={(s) => handleSelectPane(1, s)}
                  sections={availableSections}
                  isMaximized={false}
                  onToggleMaximize={() => setMaximizedPane(1)}
                />
                <div className="flex-grow overflow-auto min-h-0 pt-1">
                  <SectionContent
                    section={paneSlots[1]}
                    isAppealProject={isAppealProject}
                    annexureMode={annexureMode}
                    factsEditor={factsEditor}
                    form={form}
                  />
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={20} minSize={15}>
              <div className="flex flex-col h-full p-1.5">
                <PaneHeader
                  paneIndex={2}
                  section={paneSlots[2]}
                  onSelectSection={(s) => handleSelectPane(2, s)}
                  sections={availableSections}
                  isMaximized={false}
                  onToggleMaximize={() => setMaximizedPane(2)}
                />
                <div className="flex-grow overflow-auto min-h-0 pt-1">
                  <SectionContent
                    section={paneSlots[2]}
                    isAppealProject={isAppealProject}
                    annexureMode={annexureMode}
                    factsEditor={factsEditor}
                    form={form}
                  />
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </EditorProvider>
  );
}
