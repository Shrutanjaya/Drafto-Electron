
"use client";

import { useState, useEffect, useRef } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { DraftoProject } from "@/lib/schema";
import { categories } from "@/lib/categories";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { PlusCircle, Trash2 } from "lucide-react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";
import { cn } from "@/lib/utils";

type LpSection = 'basicInfo' | 'legalProvisions' | 'linkedMatters' | 'optionalCategories';

const petitionerCategoryItems: { id: keyof DraftoProject['listingProforma']['specialCategories']['petitionerCategories']; label: string }[] = [
  { id: 'senior', label: 'Senior Citizen' },
  { id: 'scst', label: 'SC/ST' },
  { id: 'woman', label: 'Woman' },
  { id: 'disabled', label: 'Disabled' },
  { id: 'legalaid', label: 'Legal Aid' },
  { id: 'custody', label: 'In Custody' },
];

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

export function ListingProformaTab() {
  const form = useFormContext<DraftoProject>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "listingProforma.legalProvisions",
  });

  const mainCategory = useWatch({ control: form.control, name: "listingProforma.general.mainCategory" });
  const mainCategoryRef = useRef(mainCategory);

  useEffect(() => {
    if (mainCategory !== mainCategoryRef.current) {
      if (mainCategoryRef.current !== undefined) {
        form.setValue("listingProforma.general.subCategory", "");
      }
      mainCategoryRef.current = mainCategory;
    }
  }, [mainCategory, form]);

  const subCategoryOptions = mainCategory ? categories[mainCategory as keyof typeof categories] || [] : [];

  // Dot-active watches
  const petPhone = useWatch({ control: form.control, name: "listingProforma.general.petitionerPhone" });
  const petEmail = useWatch({ control: form.control, name: "listingProforma.general.petitionerEmail" });
  const resPhone = useWatch({ control: form.control, name: "listingProforma.general.respondentPhone" });
  const resEmail = useWatch({ control: form.control, name: "listingProforma.general.respondentEmail" });
  const mainCat = useWatch({ control: form.control, name: "listingProforma.general.mainCategory" });
  const notBefore = useWatch({ control: form.control, name: "listingProforma.general.notToListBefore" });
  const judgesPassed = useWatch({ control: form.control, name: "listingProforma.general.judgesPassedImpugned" });
  const similarDisposed = useWatch({ control: form.control, name: "listingProforma.general.similarDisposed" });
  const similarPending = useWatch({ control: form.control, name: "listingProforma.general.similarPending" });
  const litigationSame = useWatch({ control: form.control, name: "listingProforma.general.litigationOnSamePoint" });
  const firNo = useWatch({ control: form.control, name: "listingProforma.specialCategories.firNo" });
  const taxEffect = useWatch({ control: form.control, name: "listingProforma.specialCategories.taxEffect" });
  const landS4 = useWatch({ control: form.control, name: "listingProforma.specialCategories.landAcqS4" });

  const basicInfoActive = !!(petPhone || petEmail || resPhone || resEmail || mainCat || notBefore || judgesPassed);
  const legalProvisionsActive = fields.length > 0 && fields.some((f: any) => f.act?.trim());
  const linkedMattersActive = !!(similarDisposed || similarPending || litigationSame);
  const optionalActive = !!(firNo || taxEffect || landS4);

  const [selectedSection, setSelectedSection] = useState<LpSection>('basicInfo');

  return (
    <ResizablePanelGroup direction="horizontal" className="h-[calc(100vh-160px)] rounded-lg border" autoSaveId="listing-proforma-nav-panels">
      {/* Left nav */}
      <ResizablePanel defaultSize={22} minSize={16} maxSize={36}>
        <div className="flex flex-col h-full p-2 space-y-1">
          <NavRow label="Basic Information" active={basicInfoActive} selected={selectedSection === 'basicInfo'} onClick={() => setSelectedSection('basicInfo')} />
          <NavRow label="Legal Provisions" active={legalProvisionsActive} selected={selectedSection === 'legalProvisions'} onClick={() => setSelectedSection('legalProvisions')} />
          <NavRow label="Linked Matters" active={linkedMattersActive} selected={selectedSection === 'linkedMatters'} onClick={() => setSelectedSection('linkedMatters')} />
          <NavRow label="Optional Categories" active={optionalActive} selected={selectedSection === 'optionalCategories'} onClick={() => setSelectedSection('optionalCategories')} />
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Right detail */}
      <ResizablePanel defaultSize={78} minSize={64}>
        <div className="h-full overflow-y-auto p-3 space-y-4">

          {/* ── Basic Information ── */}
          {selectedSection === 'basicInfo' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</h4>
                <div className="grid grid-cols-2 gap-2">
                  <FormField control={form.control} name="listingProforma.general.petitionerPhone" render={({ field }) => (<FormItem><FormLabel className="text-xs">Petitioner Phone</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name="listingProforma.general.petitionerEmail" render={({ field }) => (<FormItem><FormLabel className="text-xs">Petitioner Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl></FormItem>)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <FormField control={form.control} name="listingProforma.general.respondentPhone" render={({ field }) => (<FormItem><FormLabel className="text-xs">Respondent Phone</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name="listingProforma.general.respondentEmail" render={({ field }) => (<FormItem><FormLabel className="text-xs">Respondent Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl></FormItem>)} />
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</h4>
                <div className="grid grid-cols-3 gap-2">
                  <FormField control={form.control} name="listingProforma.general.mainCategory" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Main Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                        <SelectContent>{Object.keys(categories).map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="listingProforma.general.subCategory" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Sub-Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={!mainCategory}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                        <SelectContent>{subCategoryOptions.map(subCat => <SelectItem key={subCat} value={subCat}>{subCat}</SelectItem>)}</SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="listingProforma.general.specialCategory" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Special Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {["N.A.", "Death Penalty", "Habeas Corpus", "Demolition of Property", "Eviction", "Bail or Anticipatory Bail"].map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Judges</h4>
                <div className="grid grid-cols-2 gap-2">
                  <FormField control={form.control} name="listingProforma.general.notToListBefore" render={({ field }) => (<FormItem><FormLabel className="text-xs">Not to be listed before</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name="listingProforma.general.judgesPassedImpugned" render={({ field }) => (<FormItem><FormLabel className="text-xs">Judges who passed the Impugned Order</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Special Categories</h4>
                <div className="flex flex-wrap gap-2">
                  {petitionerCategoryItems.map(item => (
                    <FormField key={item.id} control={form.control} name={`listingProforma.specialCategories.petitionerCategories.${item.id}`} render={({ field }) => (
                      <button
                        type="button"
                        onClick={() => field.onChange(!field.value)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer select-none",
                          field.value
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                        )}
                      >
                        {item.label}
                      </button>
                    )} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Legal Provisions ── */}
          {selectedSection === 'legalProvisions' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Legal Provisions</h4>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => append({ type: 'Central Act', act: '', section: '' })}>
                  <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Add Provision
                </Button>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-32">Type</TableHead>
                      <TableHead className="text-xs">Act / Rules</TableHead>
                      <TableHead className="text-xs w-36">Section / Rule No.</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((item, index) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <FormField control={form.control} name={`listingProforma.legalProvisions.${index}.type`} render={({ field }) => (
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl><SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="Central Act">Central Act</SelectItem>
                                <SelectItem value="Central Rule">Central Rule</SelectItem>
                                <SelectItem value="State Act">State Act</SelectItem>
                                <SelectItem value="State Rule">State Rule</SelectItem>
                              </SelectContent>
                            </Select>
                          )} />
                        </TableCell>
                        <TableCell><FormField control={form.control} name={`listingProforma.legalProvisions.${index}.act`} render={({ field }) => <Input className="h-7 text-xs" {...field} />} /></TableCell>
                        <TableCell><FormField control={form.control} name={`listingProforma.legalProvisions.${index}.section`} render={({ field }) => <Input className="h-7 text-xs" {...field} />} /></TableCell>
                        <TableCell>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(index)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {fields.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-4">
                          No legal provisions added.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* ── Linked Matters ── */}
          {selectedSection === 'linkedMatters' && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Linked Matters</h4>
              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="listingProforma.general.similarDisposed" render={({ field }) => (<FormItem><FormLabel className="text-xs">Similar disposed matter (citation)</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="listingProforma.general.similarPending" render={({ field }) => (<FormItem><FormLabel className="text-xs">Similar pending matter (case details)</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
              </div>
              <FormField control={form.control} name="listingProforma.general.litigationOnSamePoint" render={({ field }) => (<FormItem><FormLabel className="text-xs">Decided cases on same point (citation)</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
            </div>
          )}

          {/* ── Optional Categories ── */}
          {selectedSection === 'optionalCategories' && (
            <div className="space-y-5">
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Criminal Matters</h4>
                <div className="grid grid-cols-4 gap-2">
                  <FormField control={form.control} name="listingProforma.specialCategories.surrenderStatus" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Surrender Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="N.A.">N.A.</SelectItem>
                          <SelectItem value="Has Surrendered">Has Surrendered</SelectItem>
                          <SelectItem value="Has Not Surrendered">Has Not Surrendered</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="listingProforma.specialCategories.firNo" render={({ field }) => (<FormItem><FormLabel className="text-xs">FIR No.</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name="listingProforma.specialCategories.firDate" render={({ field }) => (<FormItem><FormLabel className="text-xs">FIR Date</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name="listingProforma.specialCategories.policeStation" render={({ field }) => (<FormItem><FormLabel className="text-xs">Police Station</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <FormField control={form.control} name="listingProforma.specialCategories.sentenceAwarded" render={({ field }) => (<FormItem><FormLabel className="text-xs">Sentence Awarded</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name="listingProforma.specialCategories.sentenceUndergone" render={({ field }) => (<FormItem><FormLabel className="text-xs">Sentence Undergone</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                </div>
                <FormField control={form.control} name="listingProforma.specialCategories.earlierCaseSameParties" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Earlier case between same parties?</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="No">No</SelectItem>
                        <SelectItem value="Yes">Yes</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="listingProforma.specialCategories.firAndCaseParticulars" render={({ field }) => (<FormItem><FormLabel className="text-xs">FIR &amp; Case Particulars</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="listingProforma.specialCategories.bailApplicationHistory" render={({ field }) => (<FormItem><FormLabel className="text-xs">Bail application history &amp; decision</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tax &amp; MACT</h4>
                <div className="grid grid-cols-2 gap-2">
                  <FormField control={form.control} name="listingProforma.specialCategories.taxEffect" render={({ field }) => (<FormItem><FormLabel className="text-xs">Tax Effect</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name="listingProforma.specialCategories.vehicleNo" render={({ field }) => (<FormItem><FormLabel className="text-xs">Vehicle No.</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Land Acquisition</h4>
                <div className="grid grid-cols-3 gap-2">
                  <FormField control={form.control} name="listingProforma.specialCategories.landAcqS4" render={({ field }) => (<FormItem><FormLabel className="text-xs">Section 4</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name="listingProforma.specialCategories.landAcqS6" render={({ field }) => (<FormItem><FormLabel className="text-xs">Section 6</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name="listingProforma.specialCategories.landAcqS17" render={({ field }) => (<FormItem><FormLabel className="text-xs">Section 17</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                </div>
              </div>
            </div>
          )}

        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
