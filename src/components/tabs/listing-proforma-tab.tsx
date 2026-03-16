
"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { DraftoProject } from "@/lib/schema";
import { categories } from "@/lib/categories";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useEffect, useRef } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { PlusCircle, Trash2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";
import { cn } from "@/lib/utils";

const petitionerCategoryItems: { id: keyof DraftoProject['listingProforma']['specialCategories']['petitionerCategories']; label: string }[] = [
    { id: 'senior', label: 'Senior Citizen' },
    { id: 'scst', label: 'SC/ST' },
    { id: 'woman', label: 'Woman' },
    { id: 'disabled', label: 'Disabled' },
    { id: 'legalaid', label: 'Legal Aid' },
    { id: 'custody', label: 'In Custody' },
];

export function ListingProformaTab() {
  const form = useFormContext<DraftoProject>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "listingProforma.legalProvisions",
  });

  const mainCategory = useWatch({
    control: form.control,
    name: "listingProforma.general.mainCategory",
  });

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

  return (
    <div className="space-y-3">

      {/* ── Top: Resizable split — Left: General | Right: Legal Provisions ── */}
      <ResizablePanelGroup direction="horizontal" autoSaveId="listing-proforma-split" className="min-h-[360px] rounded-lg border">
        <ResizablePanel defaultSize={55} minSize={35}>
          {/* Left Pane: General */}
          <div className="h-full overflow-y-auto p-2">
            <Card className="border-0 shadow-none">
              <CardContent className="pt-2 space-y-2 px-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</p>
                <div className="grid grid-cols-2 gap-2">
                  <FormField control={form.control} name="listingProforma.general.petitionerPhone" render={({ field }) => (<FormItem><FormLabel className="text-xs">Petitioner Phone</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name="listingProforma.general.petitionerEmail" render={({ field }) => (<FormItem><FormLabel className="text-xs">Petitioner Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl></FormItem>)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <FormField control={form.control} name="listingProforma.general.respondentPhone" render={({ field }) => (<FormItem><FormLabel className="text-xs">Respondent Phone</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name="listingProforma.general.respondentEmail" render={({ field }) => (<FormItem><FormLabel className="text-xs">Respondent Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl></FormItem>)} />
                </div>

                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Category</p>
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

                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Judges</p>
                <div className="grid grid-cols-2 gap-2">
                  <FormField control={form.control} name="listingProforma.general.notToListBefore" render={({ field }) => (<FormItem><FormLabel className="text-xs">Not to be listed before</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name="listingProforma.general.judgesPassedImpugned" render={({ field }) => (<FormItem><FormLabel className="text-xs">Judges who passed the Impugned Order</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                </div>
              </CardContent>
            </Card>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={45} minSize={30}>
          {/* Right Pane: Legal Provisions */}
          <div className="h-full overflow-y-auto p-2">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-foreground">Legal Provisions</p>
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
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* ── Bottom: Special Categories + 4 collapsible sections ── */}
      <div>
        <p className="text-xs font-semibold text-foreground mb-1.5">Special Categories</p>

        {/* Petitioner Category — always visible, pill-style */}
        <div className="flex flex-wrap gap-2 mb-2">
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

        <Accordion type="multiple" className="rounded-md border divide-y">
          {/* Criminal Matters */}
          <AccordionItem value="criminal" className="border-0">
            <AccordionTrigger className="px-3 py-2 text-xs font-medium hover:no-underline hover:bg-accent [&[data-state=open]]:bg-accent/50">
              Criminal Matters
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3 pt-1 space-y-2">
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
            </AccordionContent>
          </AccordionItem>

          {/* Tax & MACT */}
          <AccordionItem value="tax-vehicle" className="border-0">
            <AccordionTrigger className="px-3 py-2 text-xs font-medium hover:no-underline hover:bg-accent [&[data-state=open]]:bg-accent/50">
              Tax &amp; MACT
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="listingProforma.specialCategories.taxEffect" render={({ field }) => (<FormItem><FormLabel className="text-xs">Tax Effect</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="listingProforma.specialCategories.vehicleNo" render={({ field }) => (<FormItem><FormLabel className="text-xs">Vehicle No.</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Land Acquisition (Notification Dates) */}
          <AccordionItem value="land-acq" className="border-0">
            <AccordionTrigger className="px-3 py-2 text-xs font-medium hover:no-underline hover:bg-accent [&[data-state=open]]:bg-accent/50">
              Land Acquisition (Notification Dates)
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3 pt-1">
              <div className="grid grid-cols-3 gap-2">
                <FormField control={form.control} name="listingProforma.specialCategories.landAcqS4" render={({ field }) => (<FormItem><FormLabel className="text-xs">Section 4</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="listingProforma.specialCategories.landAcqS6" render={({ field }) => (<FormItem><FormLabel className="text-xs">Section 6</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="listingProforma.specialCategories.landAcqS17" render={({ field }) => (<FormItem><FormLabel className="text-xs">Section 17</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Linked Matters */}
          <AccordionItem value="linked-matters" className="border-0">
            <AccordionTrigger className="px-3 py-2 text-xs font-medium hover:no-underline hover:bg-accent [&[data-state=open]]:bg-accent/50">
              Linked Matters
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3 pt-1 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="listingProforma.general.similarDisposed" render={({ field }) => (<FormItem><FormLabel className="text-xs">Similar disposed matter (citation)</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="listingProforma.general.similarPending" render={({ field }) => (<FormItem><FormLabel className="text-xs">Similar pending matter (case details)</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
              </div>
              <FormField control={form.control} name="listingProforma.general.litigationOnSamePoint" render={({ field }) => (<FormItem><FormLabel className="text-xs">Decided cases on same point (citation)</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
