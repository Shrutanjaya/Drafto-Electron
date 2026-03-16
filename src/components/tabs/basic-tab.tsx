
"use client";

import { useFormContext, useWatch, useFieldArray } from "react-hook-form";
import { PlusCircle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { DraftoProject, VaadiTableItem, ImpugnedOrder } from "@/lib/schema";
import { impugnedOrderSchema } from "@/lib/schema";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";
import { VaadiTable } from "../custom/vaadi-table";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";
import { DateInput } from "../custom/date-input";

const highCourts = [
    "Allahabad High Court at Allahabad",
    "Allahabad High Court at Lucknow",
    "Andhra Pradesh High Court at Amaravati",
    "Bombay High Court at Mumbai",
    "Bombay High Court at Nagpur",
    "Bombay High Court at Aurangabad",
    "Bombay High Court at Panaji (Goa)",
    "Calcutta High Court at Kolkata",
    "Calcutta High Court at Port Blair",
    "Chhattisgarh High Court at Bilaspur",
    "Delhi High Court at New Delhi",
    "Gauhati High Court at Guwahati",
    "Gauhati High Court at Aizawl",
    "Gauhati High Court at Itanagar",
    "Gauhati High Court at Kohima",
    "Gauhati High Court at Shillong",
    "Gauhati High Court at Imphal",
    "Gujarat High Court at Ahmedabad",
    "Himachal Pradesh High Court at Shimla",
    "Jammu & Kashmir and Ladakh High Court at Jammu",
    "Jammu & Kashmir and Ladakh High Court at Srinagar",
    "Jharkhand High Court at Ranchi",
    "Karnataka High Court at Bengaluru",
    "Karnataka High Court at Dharwad",
    "Karnataka High Court at Kalaburagi",
    "Kerala High Court at Ernakulam",
    "Madhya Pradesh High Court at Jabalpur",
    "Madhya Pradesh High Court at Indore",
    "Madhya Pradesh High Court at Gwalior",
    "Madras High Court at Chennai",
    "Madras High Court at Madurai",
    "Manipur High Court at Imphal",
    "Meghalaya High Court at Shillong",
    "Orissa High Court at Cuttack",
    "Patna High Court at Patna",
    "Punjab & Haryana High Court at Chandigarh",
    "Rajasthan High Court at Jodhpur",
    "Rajasthan High Court at Jaipur",
    "Sikkim High Court at Gangtok",
    "Telangana High Court at Hyderabad",
    "Tripura High Court at Agartala",
    "Uttarakhand High Court at Nainital",
    "Other"
];

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

function ImpugnedOrderSentence({ index }: { index: number }) {
    const form = useFormContext<DraftoProject>();
    const selectedCourt = useWatch({ control: form.control, name: `impugnedOrders.${index}.court` });

    return (
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 p-2 rounded-md border text-xs">
        {index === 0 ? (
          <>
            This is a
            <FormField
              control={form.control}
              name="caseType"
              render={({ field }) => (
                <FormItem className="inline-block">
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-7 px-2 w-[80px]">
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
            SLP
          </>
        ) : "And"} against the Impugned
        <FormField
            control={form.control}
            name={`impugnedOrders.${index}.type`}
            render={({ field }) => (
            <FormItem className="inline-block">
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                    <SelectTrigger className="h-7 px-2 w-[210px]"><SelectValue /></SelectTrigger>
                </FormControl>
                <SelectContent>
                    <SelectItem value="Final Judgment and Order">Final Judgment and Order</SelectItem>
                    <SelectItem value="Final Order">Final Order</SelectItem>
                    <SelectItem value="Interim Order">Interim Order</SelectItem>
                </SelectContent>
                </Select>
            </FormItem>
            )}
        />
        dated
        <FormField
            control={form.control}
            name={`impugnedOrders.${index}.date`}
            render={({ field }) => (
            <FormItem className="inline-block">
                <FormControl>
                    <DateInput value={field.value} onChange={field.onChange} />
                </FormControl>
            </FormItem>
            )}
        />
        passed by the
        <FormField
            control={form.control}
            name={`impugnedOrders.${index}.court`}
            render={({ field }) => (
            <FormItem className="inline-block">
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                    <SelectTrigger className="h-7 px-2 w-[250px]"><SelectValue placeholder="Select a High Court..." /></SelectTrigger>
                </FormControl>
                <SelectContent>
                    {highCourts.map(hc => <SelectItem key={hc} value={hc}>{hc}</SelectItem>)}
                </SelectContent>
                </Select>
            </FormItem>
            )}
        />
        {selectedCourt === "Other" && (
            <FormField
            control={form.control}
            name={`impugnedOrders.${index}.customCourt`}
            render={({ field }) => (
                <FormItem className="inline-block">
                <FormControl><Input {...field} placeholder="Custom Court Name" className="h-7 px-2 w-[150px]" /></FormControl>
                </FormItem>
            )}
            />
        )}
        in
        <FormField
            control={form.control}
            name={`impugnedOrders.${index}.caseNumber`}
            render={({ field }) => (
            <FormItem className="inline-block">
                <FormControl><Textarea {...field} placeholder="Case No." ref={(el) => { field.ref(el); if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} rows={1} className="px-2 min-h-0 text-xs overflow-hidden resize-none w-[150px]" onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }} /></FormControl>
            </FormItem>
            )}
        />
        , by which
         <FormField
            control={form.control}
            name={`impugnedOrders.${index}.effect`}
            render={({ field }) => (
            <FormItem className="inline-block flex-grow">
                <FormControl><Textarea {...field} ref={(el) => { field.ref(el); if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} rows={1} className="px-2 min-h-0 text-xs overflow-hidden resize-none" onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }} /></FormControl>
            </FormItem>
            )}
        />.
    </div>
    );
}

export function BasicTab() {
  const form = useFormContext<DraftoProject>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "impugnedOrders",
  });
  
  const appealStatus = useWatch({ control: form.control, name: 'intraCourtAppealStatus' });
  const wantsDrawnBy = useWatch({ control: form.control, name: 'advocate.wantsDrawnBy' });
  const wantsSettledBy = useWatch({ control: form.control, name: 'advocate.wantsSettledBy' });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CauseTitle />
      </div>
      <ResizablePanelGroup direction="horizontal" className="h-[300px] max-h-[40vh] rounded-lg border" autoSaveId="basic-tab-panels">
        <ResizablePanel defaultSize={50}>
          <div className="flex flex-col h-full p-1">
            <h3 className="font-headline text-sm font-bold text-primary mb-1">Petitioners</h3>
            <div className="flex-grow overflow-auto"><VaadiTable name="petitioners" /></div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50}>
          <div className="flex flex-col h-full p-1">
            <h3 className="font-headline text-sm font-bold text-primary mb-1">Respondents</h3>
            <div className="flex-grow overflow-auto"><VaadiTable name="respondents" /></div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      
      <ResizablePanelGroup direction="horizontal" className="min-h-[420px] rounded-lg border" autoSaveId="basic-tab-bottom-panels">
        {/* LEFT: Impugned Orders */}
        <ResizablePanel defaultSize={40} minSize={30}>
          <div className="flex flex-col h-full overflow-auto p-2 space-y-2">
            <h3 className="font-headline text-sm font-bold text-primary">Impugned Order(s)</h3>
            <div className="space-y-1">
              {fields.map((item, index) => (
                <div key={item.id} className="relative group">
                    <ImpugnedOrderSentence index={index} />
                    {fields.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="absolute top-0.5 right-0.5 text-destructive h-6 w-6 opacity-50 group-hover:opacity-100" onClick={() => remove(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                </div>
              ))}
            </div>
            {fields.length < 2 && (
              <div className="flex justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => append(impugnedOrderSchema.parse({}))}>
                  <PlusCircle className="mr-2" /> Add Another Impugned Order
                </Button>
              </div>
            )}

            <Card>
              <CardContent className="p-2 space-y-2">
                  <div className="flex flex-col space-y-1">
                      <FormField
                        control={form.control}
                        name="intraCourtAppealStatus"
                        render={() => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={appealStatus === 'no_appeal_lies'}
                                onCheckedChange={(checked) => {
                                  form.setValue('intraCourtAppealStatus', checked ? 'no_appeal_lies' : '');
                                }}
                              />
                            </FormControl>
                            <FormLabel className="font-normal text-xs">The Impugned Order(s) is/are passed by a Ld. Single Judge of the High Court, but no intra-court appeal lies.</FormLabel>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="intraCourtAppealStatus"
                        render={() => (
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={appealStatus === 'appeal_lies_but'}
                                onCheckedChange={(checked) => {
                                  form.setValue('intraCourtAppealStatus', checked ? 'appeal_lies_but' : '');
                                }}
                              />
                            </FormControl>
                            <FormLabel className="font-normal text-xs">The Impugned Order(s) is/are passed by a Ld. Single Judge of the High Court and an intra-court appeal lies. However,</FormLabel>
                          </FormItem>
                        )}
                      />
                  </div>
                  {appealStatus === 'appeal_lies_but' && (
                    <FormField
                      control={form.control}
                      name="intraCourtAppealReason"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl><Textarea {...field} placeholder="provide reason..." className="text-xs" /></FormControl>
                        </FormItem>
                      )}
                    />
                  )}
              </CardContent>
            </Card>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* RIGHT: Advocates + Deponent */}
        <ResizablePanel defaultSize={60} minSize={30}>
          <div className="flex flex-col h-full overflow-auto p-2 space-y-2">
            <div className="space-y-1">
              <h3 className="font-headline text-sm font-bold text-primary">Advocates</h3>
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
            </div>

            <div className="space-y-1">
              <h3 className="font-headline text-sm font-bold text-primary">Deponent</h3>
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
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

    </div>
  );
}
    

    

    
