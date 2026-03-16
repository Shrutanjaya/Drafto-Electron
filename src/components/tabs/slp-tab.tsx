
"use client";

import { useState, useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
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
import { DeclarationsDialog, DeclarationsContent } from "@/components/dialogs/declarations-dialog";
import { InterimReliefDialog, InterimReliefContent } from "@/components/dialogs/interim-relief-dialog";
import { QuestionsOfLawDialog } from "@/components/dialogs/questions-of-law-dialog";
import { EditorToolbar } from "../custom/editor-toolbar";
import { EditorProvider } from "@/components/custom/editor-provider";
import { BadhiyaBox } from "../custom/badhiya-box";
import { FormControl, FormField, FormItem } from "../ui/form";
import { AffidavitDialog } from "../dialogs/affidavit-dialog";
import { VakalatnamaDialog } from "../dialogs/vakalatnama-dialog";
import { getSettings } from "../dialogs/settings-dialog";
import { useCalculatedValues } from "@/hooks/use-calculated-values";

type SlpSection = 'synopsis' | 'listOfDates' | 'grounds' | 'questionsOfLaw' | 'interimRelief' | 'appendix' | 'declarations';
const EDITOR_SECTIONS: SlpSection[] = ['synopsis', 'listOfDates', 'grounds', 'questionsOfLaw', 'interimRelief', 'appendix'];

function NavRow({ label, active, selected, onClick }: { label: string; active: boolean; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
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

export function SlpTab() {
  const form = useFormContext<DraftoProject>();
  const { ioText } = useCalculatedValues();

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

  // Sync SLP tab view preference from settings (responds to settings save in same tab)
  const [viewMode, setViewMode] = useState<'splitter' | 'navigation'>(() => getSettings().slpTabView ?? 'splitter');
  useEffect(() => {
    const handler = () => setViewMode(getSettings().slpTabView ?? 'splitter');
    window.addEventListener('drafto-settings-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('drafto-settings-changed', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const [selectedSection, setSelectedSection] = useState<SlpSection>('synopsis');

  // Dot-active watches
  const synopsis = useWatch({ control: form.control, name: 'synopsis' });
  const listOfDatesWatch = useWatch({ control: form.control, name: 'listOfDates' });
  const groundsWatch = useWatch({ control: form.control, name: 'grounds' });
  const questionsOfLawWatch = useWatch({ control: form.control, name: 'questionsOfLaw' });
  const wantsInterimRelief = useWatch({ control: form.control, name: 'wantsInterimRelief' });
  const interimReliefPrayersWatch = useWatch({ control: form.control, name: 'interimReliefPrayers' });
  const wantsAppendix = useWatch({ control: form.control, name: 'wantsAppendix' });
  const appendixFile = useWatch({ control: form.control, name: 'appendixFile' });
  const appendixManualEntry = useWatch({ control: form.control, name: 'appendixManualEntry' });
  const declarationsWatch = useWatch({ control: form.control, name: 'declarations' });
  const aorCertWatch = useWatch({ control: form.control, name: 'aorCertificate' });

  const hasAamRow = (rows: any[]) => rows?.some((r: any) => r.particulars?.trim()) ?? false;
  const hasLoDRow = (rows: any[]) => rows?.some((r: any) => r.date?.trim() || r.event?.trim()) ?? false;

  const synopsisActive = !!synopsis?.trim();
  const listOfDatesActive = hasLoDRow(listOfDatesWatch);
  const groundsActive = hasAamRow(groundsWatch);
  const questionsOfLawActive = hasAamRow(questionsOfLawWatch);
  const interimReliefActive = !wantsInterimRelief || hasAamRow(interimReliefPrayersWatch);
  const appendixActive = !wantsAppendix || !!(appendixFile instanceof File || appendixManualEntry?.trim());
  const declarationsActive = !!(
    declarationsWatch?.noOtherSLPFiled &&
    declarationsWatch?.annexuresTrueCopies &&
    aorCertWatch?.confinedToPleadings &&
    aorCertWatch?.annexuresNecessary &&
    aorCertWatch?.basedOnInstructions
  );

  if (viewMode === 'navigation') {
    return (
      <EditorProvider>
        <div className="flex flex-col h-[calc(100vh-160px)]">
          <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId="slp-tab-nav-panels">
            <ResizablePanel defaultSize={25} minSize={18} maxSize={40}>
              <div className="flex flex-col h-full p-2 space-y-1">
                <NavRow label="Synopsis" active={synopsisActive} selected={selectedSection === 'synopsis'} onClick={() => setSelectedSection('synopsis')} />
                <NavRow label="List of Dates" active={listOfDatesActive} selected={selectedSection === 'listOfDates'} onClick={() => setSelectedSection('listOfDates')} />
                <NavRow label="Grounds" active={groundsActive} selected={selectedSection === 'grounds'} onClick={() => setSelectedSection('grounds')} />
                <NavRow label="Questions of Law" active={questionsOfLawActive} selected={selectedSection === 'questionsOfLaw'} onClick={() => setSelectedSection('questionsOfLaw')} />
                <NavRow label="Interim Relief" active={interimReliefActive} selected={selectedSection === 'interimRelief'} onClick={() => setSelectedSection('interimRelief')} />
                <NavRow label="Appendix" active={appendixActive} selected={selectedSection === 'appendix'} onClick={() => setSelectedSection('appendix')} />
                <NavRow label="Declarations" active={declarationsActive} selected={selectedSection === 'declarations'} onClick={() => setSelectedSection('declarations')} />
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={75} minSize={60}>
              <div className="flex flex-col h-full p-2 space-y-2">
                {EDITOR_SECTIONS.includes(selectedSection) && (
                  <div className="flex items-center gap-1 shrink-0">
                    <EditorToolbar />
                  </div>
                )}
                <div className="flex-grow overflow-auto">
                  {selectedSection === 'synopsis' && (
                    <FormField
                      control={form.control}
                      name="synopsis"
                      render={({ field }) => (
                        <FormItem className="h-full flex flex-col">
                          <FormControl>
                            <BadhiyaBox value={field.value} onChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  )}
                  {selectedSection === 'listOfDates' && <LoDTable />}
                  {selectedSection === 'grounds' && <AamTable name="grounds" defaultRows={10} />}
                  {selectedSection === 'questionsOfLaw' && <AamTable name="questionsOfLaw" defaultRows={10} />}
                  {selectedSection === 'interimRelief' && <InterimReliefContent />}
                  {selectedSection === 'appendix' && <AppendixContent />}
                  {selectedSection === 'declarations' && <DeclarationsContent />}
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
          <QuestionsOfLawDialog />
          <InterimReliefDialog />
          <DeclarationsDialog />
          <AppendixDialog />
          <div className="flex-grow"></div>
          <EditorToolbar />
        </div>

        <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId="slp-tab-panels">
          <ResizablePanel defaultSize={50}>
            <div className="flex flex-col h-full p-1">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">List of Dates</h4>
              <div className="flex-grow overflow-auto">
                <LoDTable />
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={30}>
            <div className="flex flex-col h-full p-1">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Grounds</h4>
              <div className="flex-grow overflow-auto">
                <AamTable name="grounds" defaultRows={10} />
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={20}>
            <div className="flex flex-col h-full p-1">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Synopsis</h4>
              <FormField
                control={form.control}
                name="synopsis"
                render={({ field }) => (
                  <FormItem className="flex-grow flex flex-col overflow-y-auto">
                    <FormControl>
                      <BadhiyaBox
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </EditorProvider>
  );
}




