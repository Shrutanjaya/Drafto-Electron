"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { useStickyState } from "@/hooks/useStickyState";
import { cn } from "@/lib/utils";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { DraftoProject, VaadiTableItem } from "@/lib/schema";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { VaadiTable } from "@/components/custom/vaadi-table";
import { isPil } from "@/lib/court-family";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DateInput } from "@/components/custom/date-input";
import { UseFirstPartyButton } from "@/components/custom/use-first-party-button";

const getPartyHeader = (parties: VaadiTableItem[] | undefined): string => {
  if (!parties || parties.length === 0 || !parties[0]?.name) return "";
  if (parties.length === 1) return parties[0].name;
  if (parties.length === 2) return `${parties[0].name} & Anr.`;
  return `${parties[0].name} & Ors.`;
};

function CauseTitle() {
  const form = useFormContext<DraftoProject>();
  const petitioners = useWatch({ control: form.control, name: "petitioners" });
  const respondents = useWatch({ control: form.control, name: "respondents" });

  const petHeader = getPartyHeader(petitioners);
  const resHeader = getPartyHeader(respondents);

  return (
    <div className="flex-grow rounded-md border bg-muted p-1 text-center">
      <p className="font-bold text-xs">{petHeader || "[Petitioners]"} v. {resHeader || "[Respondents]"}</p>
    </div>
  );
}

function isVaadiTableComplete(rows: VaadiTableItem[] | undefined): boolean {
  const nonBlank = (rows ?? []).filter(r => r.name || r.address || r.positionInEarlierCourt);
  if (nonBlank.length === 0) return false;
  return nonBlank.every(r => !!r.name && !!r.address);
}

function NavRow({ label, active, selected, onClick }: { label: string; active: boolean; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-ro-nav
      onClick={onClick}
      className={cn(
        "w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2",
        selected
          ? "bg-primary text-primary-foreground dark:text-white"
          : "hover:bg-muted text-foreground"
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

export function ScWpBasicTab() {
  const form = useFormContext<DraftoProject>();

  const wantsDrawnBy = useWatch({ control: form.control, name: 'advocate.wantsDrawnBy' });
  const wantsSettledBy = useWatch({ control: form.control, name: 'advocate.wantsSettledBy' });

  // Nav dot watches
  // A PIL asks its petitioners for the Rule 12(1)(d) disclosures.
  const scWpCourtType = useWatch({ control: form.control, name: 'courtType' });
  const isPilProject = isPil(scWpCourtType);
  const petitionersWatch = useWatch({ control: form.control, name: 'petitioners' as any }) as VaadiTableItem[];
  const respondentsWatch = useWatch({ control: form.control, name: 'respondents' as any }) as VaadiTableItem[];
  const aorName = useWatch({ control: form.control, name: 'advocate.aorName' });
  const aorCode = useWatch({ control: form.control, name: 'advocate.aorCode' });
  const filingPlace = useWatch({ control: form.control, name: 'advocate.filingPlace' });
  const drawnByName = useWatch({ control: form.control, name: 'advocate.drawnByName' });
  const drawnByPlace = useWatch({ control: form.control, name: 'advocate.drawnByPlace' });
  const settledByName = useWatch({ control: form.control, name: 'advocate.settledByName' });
  const settledByPlace = useWatch({ control: form.control, name: 'advocate.settledByPlace' });
  const deponentName = useWatch({ control: form.control, name: 'deponent.name' });
  const deponentFatherName = useWatch({ control: form.control, name: 'deponent.fatherName' });
  const deponentAddress = useWatch({ control: form.control, name: 'deponent.address' });
  const deponentLocation = useWatch({ control: form.control, name: 'deponent.location' });
  const deponentAge = useWatch({ control: form.control, name: 'deponent.age' });

  const [selectedSection, setSelectedSection] = useStickyState<'parties' | 'advocates' | 'deponent'>('sc-wp-basic-tab-section', 'parties');

  const partiesActive = isVaadiTableComplete(petitionersWatch) && isVaadiTableComplete(respondentsWatch);

  const advocatesActive = !!aorName && !!aorCode && !!filingPlace &&
    (!wantsDrawnBy || (!!drawnByName && !!drawnByPlace)) &&
    (!wantsSettledBy || (!!settledByName && !!settledByPlace));

  const deponentActive = !!deponentName && !!deponentFatherName && !!deponentAddress &&
    !!deponentLocation && !!deponentAge;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CauseTitle />
      </div>

      <ResizablePanelGroup direction="horizontal" className="min-h-[520px] rounded-lg border" autoSaveId="sc-wp-basic-tab-panels">
        {/* LEFT: Section Nav */}
        <ResizablePanel defaultSize={28} minSize={18} maxSize={40}>
          <div className="flex flex-col h-full p-2 space-y-1">
            <NavRow
              label="Memo of Parties"
              active={partiesActive}
              selected={selectedSection === 'parties'}
              onClick={() => setSelectedSection('parties')}
            />
            <NavRow
              label="Advocates"
              active={advocatesActive}
              selected={selectedSection === 'advocates'}
              onClick={() => setSelectedSection('advocates')}
            />
            <NavRow
              label="Deponent"
              active={deponentActive}
              selected={selectedSection === 'deponent'}
              onClick={() => setSelectedSection('deponent')}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* RIGHT: Detail Panel */}
        <ResizablePanel defaultSize={72} minSize={60}>
          <div className="flex flex-col h-full overflow-auto p-2 space-y-2">

            {selectedSection === 'parties' && (
              <div className="flex flex-col h-full space-y-2">
                <div className="flex items-center gap-2 p-2 rounded-md border text-xs bg-muted/40">
                  <span>This is a</span>
                  <FormField
                    control={form.control}
                    name="caseType"
                    render={({ field }) => (
                      <FormItem className="inline-block">
                        <Select onValueChange={field.onChange} value={field.value || "Civil"}>
                          <FormControl>
                            <SelectTrigger className="h-7 px-2 w-[110px]">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Civil">Civil</SelectItem>
                            <SelectItem value="Criminal">Criminal</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <span>Writ Petition under Article 32 of the Constitution of India</span>
                </div>

                <ResizablePanelGroup direction="horizontal" className="flex-grow min-h-[360px] rounded-lg border" autoSaveId="sc-wp-parties-panels">
                  <ResizablePanel defaultSize={50}>
                    <div className="flex flex-col h-full p-1">
                      <h4 className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide mb-1">Petitioners</h4>
                      <div className="flex-grow overflow-auto"><VaadiTable name="petitioners" showThrough showPosition={false} showPilDetails={isPilProject} /></div>
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={50}>
                    <div className="flex flex-col h-full p-1">
                      <h4 className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide mb-1">Respondents</h4>
                      <div className="flex-grow overflow-auto"><VaadiTable name="respondents" showThrough showPosition={false} /></div>
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            )}

            {selectedSection === 'advocates' && (
              <>
                <h4 className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Advocates</h4>
                <Card>
                  <CardContent className="p-2 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                      Filed by
                      <FormField control={form.control} name="advocate.aorName" render={({ field }) => ( <FormItem className="inline-block"><FormControl><Input {...field} placeholder="AoR Name" className="h-7 px-2 w-[150px]" /></FormControl></FormItem> )}/>,
                      AoR having AoR Code
                      <FormField control={form.control} name="advocate.aorCode" render={({ field }) => ( <FormItem className="inline-block"><FormControl><Input {...field} placeholder="Code" className="h-7 px-2 w-[80px]" /></FormControl></FormItem> )}/>
                      on
                      <FormField control={form.control} name="advocate.filingDate" render={({ field }) => (<FormItem className="inline-block"><FormControl><DateInput value={field.value} onChange={field.onChange} /></FormControl></FormItem>)}/>
                      at
                      <FormField control={form.control} name="advocate.filingPlace" render={({ field }) => ( <FormItem className="inline-block"><FormControl><Input {...field} placeholder="Place" className="h-7 px-2 w-[120px]" /></FormControl></FormItem> )}/>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                      <FormField control={form.control} name="advocate.wantsDrawnBy" render={({ field }) => (<FormItem className="flex items-center space-x-1"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)}/>
                      Drawn by
                      <FormField control={form.control} name="advocate.drawnByName" render={({ field }) => ( <FormItem className="inline-block"><FormControl><Input {...field} placeholder="Drawn by Name" className="h-7 px-2 w-[150px]" disabled={!wantsDrawnBy} /></FormControl></FormItem> )}/>
                      on
                      <FormField control={form.control} name="advocate.drawnByDate" render={({ field }) => (<FormItem className="inline-block"><FormControl><DateInput value={field.value} onChange={field.onChange} disabled={!wantsDrawnBy} /></FormControl></FormItem>)}/>
                      at
                      <FormField control={form.control} name="advocate.drawnByPlace" render={({ field }) => ( <FormItem className="inline-block"><FormControl><Input {...field} placeholder="Place" className="h-7 px-2 w-[120px]" disabled={!wantsDrawnBy} /></FormControl></FormItem> )}/>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                      <FormField control={form.control} name="advocate.wantsSettledBy" render={({ field }) => (<FormItem className="flex items-center space-x-1"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)}/>
                      Settled by
                      <FormField control={form.control} name="advocate.settledByName" render={({ field }) => ( <FormItem className="inline-block"><FormControl><Input {...field} placeholder="Settled by Name" className="h-7 px-2 w-[150px]" disabled={!wantsSettledBy} /></FormControl></FormItem> )}/>
                      on
                      <FormField control={form.control} name="advocate.settledByDate" render={({ field }) => (<FormItem className="inline-block"><FormControl><DateInput value={field.value} onChange={field.onChange} disabled={!wantsSettledBy} /></FormControl></FormItem>)}/>
                      at
                      <FormField control={form.control} name="advocate.settledByPlace" render={({ field }) => ( <FormItem className="inline-block"><FormControl><Input {...field} placeholder="Place" className="h-7 px-2 w-[120px]" disabled={!wantsSettledBy} /></FormControl></FormItem> )}/>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {selectedSection === 'deponent' && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Deponent</h4>
                  <UseFirstPartyButton />
                </div>
                <Card>
                  <CardContent className="p-2">
                    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs">
                      The Deponent is
                      <FormField
                        control={form.control}
                        name="deponent.name"
                        render={({ field }) => (
                          <FormItem className="inline-block">
                            <FormControl><Input {...field} placeholder="Name" className="h-7 px-2 w-[150px]" /></FormControl>
                          </FormItem>
                        )}
                      />,
                      <FormField
                        control={form.control}
                        name="deponent.relationship"
                        render={({ field }) => (
                          <FormItem className="inline-block">
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl><SelectTrigger className="h-7 px-2 w-[120px]"><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="son of">son of</SelectItem>
                                <SelectItem value="daughter of">daughter of</SelectItem>
                                <SelectItem value="wife of">wife of</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="deponent.fatherName"
                        render={({ field }) => (
                          <FormItem className="inline-block">
                            <FormControl><Input {...field} placeholder="Father's Name" className="h-7 px-2 w-[150px]" /></FormControl>
                          </FormItem>
                        )}
                      />,
                      aged
                      <FormField
                        control={form.control}
                        name="deponent.age"
                        render={({ field }) => (
                          <FormItem className="inline-block">
                            <FormControl><Input {...field} placeholder="Age" className="h-7 px-2 w-[50px]" /></FormControl>
                          </FormItem>
                        )}
                      />
                      years, resident of
                      <FormField
                        control={form.control}
                        name="deponent.address"
                        render={({ field }) => (
                          <FormItem className="inline-block flex-grow">
                            <FormControl><Textarea {...field} ref={(el) => { field.ref(el); if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} rows={1} className="px-2 min-h-0 text-xs overflow-hidden resize-none" onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }} /></FormControl>
                          </FormItem>
                        )}
                      />,
                      presently at
                      <FormField
                        control={form.control}
                        name="deponent.location"
                        render={({ field }) => (
                          <FormItem className="inline-block">
                            <FormControl><Input {...field} placeholder="Location" className="h-7 px-2 w-[120px]" /></FormControl>
                          </FormItem>
                        )}
                      />.
                      The Deponent is the
                      <FormField
                        control={form.control}
                        name="deponent.role"
                        render={({ field }) => (
                          <FormItem className="inline-block">
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                        )}
                      />.
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
