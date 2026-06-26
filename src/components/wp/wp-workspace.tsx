"use client";

import { useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Sparkles } from "lucide-react";
import type { DraftoProject } from "@/lib/schema";
import { transposeLodToFacts } from "@/lib/wp/wp-facts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import { VaadiTable } from "@/components/custom/vaadi-table";
import { LoDTable } from "@/components/custom/lod-table";
import { AamTable } from "@/components/custom/aam-table";
import { BadhiyaBox } from "@/components/custom/badhiya-box";
import { EditorProvider } from "@/components/custom/editor-provider";
import { EditorToolbar } from "@/components/custom/editor-toolbar";
import { DateInput } from "@/components/custom/date-input";

// Small labelled field wrapper for consistent spacing.
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

export function WpWorkspace() {
  const form = useFormContext<DraftoProject>();
  const isIoWrit = useWatch({ control: form.control, name: "wp.isIoWrit" });

  // Guards the programmatic Facts write so it isn't mistaken for a user edit.
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

  return (
    <Tabs defaultValue="preliminary" className="p-1">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="preliminary">Preliminary</TabsTrigger>
        <TabsTrigger value="synopsis">Synopsis &amp; Dates</TabsTrigger>
        <TabsTrigger value="petition">Petition</TabsTrigger>
        <TabsTrigger value="cms">Applications</TabsTrigger>
      </TabsList>

      {/* ── Preliminary ───────────────────────────────────────────────── */}
      <TabsContent value="preliminary" className="mt-1 space-y-3">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Parties</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-medium">Petitioner(s)</p>
              <VaadiTable name="petitioners" />
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">Respondent(s)</p>
              <VaadiTable name="respondents" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Petition Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Petition type">
              <FormField
                control={form.control}
                name="caseType"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Civil">Writ Petition (Civil)</SelectItem>
                      <SelectItem value="Criminal">Writ Petition (Criminal)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field label="Constitutional basis">
              <FormField
                control={form.control}
                name="wp.articleBasis"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="226">Article 226</SelectItem>
                      <SelectItem value="227">Article 227</SelectItem>
                      <SelectItem value="226 read with 227">Article 226 read with 227</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field label="Listing date" hint="Shown in the Notice of Motion (“likely to be listed on …”).">
              <FormField
                control={form.control}
                name="wp.listingDate"
                render={({ field }) => (
                  <DateInput value={field.value as Date} onChange={field.onChange} />
                )}
              />
            </Field>

            <Field label="Impugned-order writ?" hint="If on, the impugned order is Annexure P-1 and relief (a) auto-quashes it; a Stay CM becomes available.">
              <FormField
                control={form.control}
                name="wp.isIoWrit"
                render={({ field }) => (
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox id="wp-io" checked={field.value} onCheckedChange={field.onChange} />
                    <label htmlFor="wp-io" className="text-sm">This writ challenges an Impugned Order</label>
                  </div>
                )}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Advocate (“Filed by” block)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Advocate name">
              <FormField control={form.control} name="wp.advocate.name"
                render={({ field }) => <Input {...field} placeholder="e.g. Shrutanjaya Bhardwaj" />} />
            </Field>
            <Field label="Firm / Chamber">
              <FormField control={form.control} name="wp.advocate.firm"
                render={({ field }) => <Input {...field} placeholder="e.g. Pravah Law" />} />
            </Field>
            <Field label="Address">
              <FormField control={form.control} name="wp.advocate.address"
                render={({ field }) => <Textarea {...field} rows={2} placeholder="Office address" />} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Enrolment No.">
                <FormField control={form.control} name="wp.advocate.enrolmentNo"
                  render={({ field }) => <Input {...field} placeholder="e.g. D 2051/2017" />} />
              </Field>
              <Field label="Phone">
                <FormField control={form.control} name="wp.advocate.phone"
                  render={({ field }) => <Input {...field} placeholder="e.g. 011-45621824" />} />
              </Field>
              <Field label="Email">
                <FormField control={form.control} name="wp.advocate.email"
                  render={({ field }) => <Input {...field} placeholder="office@firm.in" />} />
              </Field>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Synopsis & List of Dates ──────────────────────────────────── */}
      <TabsContent value="synopsis" className="mt-1 space-y-3">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Synopsis</CardTitle>
          </CardHeader>
          <CardContent>
            <EditorProvider>
              <EditorToolbar />
              <FormField
                control={form.control}
                name="synopsis"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormControl>
                      <BadhiyaBox value={field.value} onChange={field.onChange} path={field.name} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </EditorProvider>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-base">List of Dates &amp; Events</CardTitle>
            <FormField
              control={form.control}
              name="wp.splitSynopsisAndLod"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox id="wp-split" checked={field.value} onCheckedChange={field.onChange} />
                  <label htmlFor="wp-split" className="text-xs">Start List of Dates on a fresh page</label>
                </div>
              )}
            />
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-muted-foreground">
              Attach annexures to the relevant rows, exactly as in an SLP. The Facts
              section (Petition tab) is generated from these rows.
            </p>
            <LoDTable />
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Petition (Reliefs / Facts / Grounds) ──────────────────────── */}
      <TabsContent value="petition" className="mt-1 space-y-3">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Reliefs (Prayers)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-muted-foreground">
              Single source of truth — these reliefs drive both the top reliefs block
              and the intro paragraph. Keep the residuary prayer (“Pass any such other
              order…”) as the last row.
              {isIoWrit && " Relief (a) to quash the impugned order is added automatically."}
            </p>
            <AamTable name="wp.reliefs" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-base">Facts</CardTitle>
            <Button type="button" size="sm" variant="secondary" onClick={handleGenerateFacts}>
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              Generate from List of Dates
            </Button>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-muted-foreground">
              Transposed from the List of Dates (each row becomes prose, with the
              annexure sentences inserted here rather than in the LoD). Editing locks
              it against regeneration; regenerating asks before overwriting your edits.
            </p>
            <EditorProvider>
              <EditorToolbar />
              <FormField
                control={form.control}
                name="wp.facts"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormControl>
                      <BadhiyaBox
                        value={field.value}
                        onChange={(v: string) => {
                          field.onChange(v);
                          if (generatingFacts.current) {
                            generatingFacts.current = false;
                          } else {
                            form.setValue("wp.factsEdited", true);
                          }
                        }}
                        path={field.name}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </EditorProvider>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Grounds</CardTitle>
          </CardHeader>
          <CardContent>
            <AamTable name="grounds" />
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Applications (CMs) ────────────────────────────────────────── */}
      <TabsContent value="cms" className="mt-1 space-y-3">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">CM Applications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isIoWrit && (
              <div className="space-y-2 rounded-md border p-3">
                <FormField
                  control={form.control}
                  name="wp.cms.stay.active"
                  render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Checkbox id="cm-stay" checked={field.value} onCheckedChange={field.onChange} />
                      <label htmlFor="cm-stay" className="text-sm font-medium">CM for Stay of the impugned order</label>
                    </div>
                  )}
                />
                <div className="pl-6">
                  <p className="mb-1 text-xs text-muted-foreground">Grounds for stay</p>
                  <AamTable name="wp.cms.stay.grounds" />
                </div>
              </div>
            )}

            <FormField
              control={form.control}
              name="wp.cms.lengthySynopsis.active"
              render={({ field }) => (
                <div className="flex items-center gap-2 rounded-md border p-3">
                  <Checkbox id="cm-synopsis" checked={field.value} onCheckedChange={field.onChange} />
                  <label htmlFor="cm-synopsis" className="text-sm">CM seeking permission to file a lengthy Synopsis &amp; List of Dates</label>
                </div>
              )}
            />

            <FormField
              control={form.control}
              name="wp.cms.exemptionCopies.active"
              render={({ field }) => (
                <div className="flex items-center gap-2 rounded-md border p-3">
                  <Checkbox id="cm-exempt" checked={field.value} onCheckedChange={field.onChange} />
                  <label htmlFor="cm-exempt" className="text-sm">CM for exemption from filing certified / legible / true-typed copies</label>
                </div>
              )}
            />

            <p className="text-xs text-muted-foreground">
              Custom CMs (with their own A-series annexures) will be added in a later phase.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
