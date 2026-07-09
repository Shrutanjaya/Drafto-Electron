
"use client"

import React, { useMemo, useRef, useState, useEffect } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { annexureSchema, collyDocumentSchema, type DraftoProject } from "@/lib/schema";
import { pickFile } from "@/lib/utils/pick-file";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { PlusCircle, Trash2, Paperclip, Copy, Upload } from "lucide-react";
import { Checkbox } from "../ui/checkbox";
import { Card, CardContent } from "../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { FIND_REVEAL_EVENT, getPendingReveal } from "@/lib/find-reveal";

interface AnnexureDialogProps {
  lodIndex: number;
  children: React.ReactElement;
  annexureNumberingMap: Map<string, number>;
}

function useIsDark() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

// Colly constituents editor (Delhi HC writ petitions). Lets the user club several
// files under one P-number; each constituent is bookmarked separately in the PDF.
function CollyConstituents({ lodIndex, annexIndex }: { lodIndex: number; annexIndex: number }) {
  const form = useFormContext<DraftoProject>();
  const base = `listOfDates.${lodIndex}.annexures.${annexIndex}.collyDocuments`;
  const { fields, append, remove } = useFieldArray({ control: form.control, name: base as any });
  const pick = async (i: number) => {
    const file = await pickFile();
    if (file) {
      form.setValue(`${base}.${i}.file` as any, file, { shouldDirty: true });
      form.setValue(`${base}.${i}.filePath` as any, (file as any).path);
    }
  };
  return (
    <div className="mt-1 ml-6 space-y-1 border-l pl-2">
      <p className="text-[10px] text-muted-foreground">Colly constituents — each is bookmarked separately in the PDF:</p>
      {fields.map((f, i) => {
        const cd: any = form.watch(`${base}.${i}` as any);
        const has = cd?.file instanceof File || !!cd?.filePath;
        return (
          <div key={f.id} className="flex items-center gap-1">
            <button type="button" onClick={() => pick(i)} title="Upload file" className={cn("rounded p-1 hover:bg-muted", has && "text-accent")}>
              <Upload className="h-3.5 w-3.5" />
            </button>
            <FormField control={form.control} name={`${base}.${i}.title` as any} render={({ field }) => (
              <FormItem className="flex-grow"><FormControl><Input {...field} placeholder="Description" className="h-7 text-xs" /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name={`${base}.${i}.date` as any} render={({ field }) => (
              <FormItem><FormControl><Input {...field} placeholder="Date" className="h-7 w-[110px] text-xs" /></FormControl></FormItem>
            )} />
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => remove(i)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}
      <Button type="button" size="sm" variant="outline" className="h-6 text-xs" onClick={() => append(collyDocumentSchema.parse({}))}>
        <PlusCircle className="mr-1 h-3 w-3" />Add document
      </Button>
    </div>
  );
}

export function AnnexureDialog({ lodIndex, children, annexureNumberingMap }: AnnexureDialogProps) {
  const form = useFormContext<DraftoProject>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: `listOfDates.${lodIndex}.annexures`,
  });
  const isDark = useIsDark();
  const isWp = form.watch("courtType") === "WritPetitionDHC";
  const isIoWrit = form.watch("wp.isIoWrit");

  // Controlled open state so Find & Replace can pop this dialog open to reveal a
  // matching annexure field. Each List-of-Dates row has its own AnnexureDialog;
  // on a Find reveal, the one whose row matches opens and the rest close. Checked
  // both on the FIND_REVEAL_EVENT and on mount (the dialog may mount *after* the
  // event fires, when the reveal first switches to the Petition tab/section).
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const applyPending = () => {
      const p = getPendingReveal();
      setOpen(p?.annexureLodIndex === lodIndex);
    };
    window.addEventListener(FIND_REVEAL_EVENT, applyPending);
    applyPending();
    return () => window.removeEventListener(FIND_REVEAL_EVENT, applyPending);
  }, [lodIndex]);

  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const typedFileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [cloneSelectValue, setCloneSelectValue] = useState("");

  const cloneOptions = (() => {
    const allLods = form.getValues("listOfDates") ?? [];
    return allLods
      .flatMap(lod => lod.annexures ?? [])
      .filter(a => annexureNumberingMap.has(a.id))
      .map(a => ({ id: a.id, pNumber: annexureNumberingMap.get(a.id)!, title: a.title }))
      .sort((a, b) => a.pNumber - b.pNumber);
  })();

  const handleClone = (sourceId: string) => {
    const allLods = form.getValues("listOfDates") ?? [];
    const source = allLods.flatMap(lod => lod.annexures ?? []).find(a => a.id === sourceId);
    if (!source) return;
    append({
      id: `annex_${Math.random()}`,
      isAdditionalDocument: source.isAdditionalDocument,
      copyType: source.copyType,
      title: source.title,
      date: source.date,
      customText: source.customText,
    });
  };


  const handleIconClick = async (index: number, isTyped: boolean = false) => {
    if (window.electron?.openFileDialog) {
      const file = await pickFile();
      if (file) {
        if (isTyped) {
          form.setValue(`listOfDates.${lodIndex}.annexures.${index}.typedOrTranslatedFile`, file, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
          form.setValue(`listOfDates.${lodIndex}.annexures.${index}.typedOrTranslatedFilePath`, (file as any).path);
        } else {
          form.setValue(`listOfDates.${lodIndex}.annexures.${index}.file`, file, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
          form.setValue(`listOfDates.${lodIndex}.annexures.${index}.filePath`, (file as any).path);
        }
      }
    } else {
      // Fallback to browser file input
      if (isTyped) {
        typedFileInputRefs.current[index]?.click();
      } else {
        fileInputRefs.current[index]?.click();
      }
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="max-w-[90vw] w-full md:max-w-7xl p-0 shadow-none border-0 bg-transparent" side="bottom" align="end">
        <div className={cn(isDark ? 'force-light' : 'dark', 'p-2 rounded-md border-2 border-border/80 bg-background text-foreground shadow-2xl')}>
        <TooltipProvider>
          <div className="flex flex-col h-full">
              <div className="flex-grow overflow-y-auto pr-1 space-y-1 py-2 max-h-[60vh]">
              {fields.map((item, index) => {
                  const currentAnnexure = form.watch(`listOfDates.${lodIndex}.annexures.${index}`);
                  const pNumber = currentAnnexure ? annexureNumberingMap.get(currentAnnexure.id) : undefined;
                  const fileValue = form.watch(`listOfDates.${lodIndex}.annexures.${index}.file`);
                  const typedFileValue = form.watch(`listOfDates.${lodIndex}.annexures.${index}.typedOrTranslatedFile`);
                  const showTypedUpload = currentAnnexure.copyType === 'true and typed copy' || currentAnnexure.copyType === 'true and translated copy';
                  
                  const hasFile = fileValue instanceof File;
                  const hasTypedFile = typedFileValue instanceof File;

                  return (
                  <Card key={item.id} className="relative">
                      <CardContent className="p-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <FormField
                              control={form.control}
                              name={`listOfDates.${lodIndex}.annexures.${index}.file`}
                              render={({ field: { onChange, value, ...rest } }) => (
                              <FormItem>
                                  <FormControl>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button type="button" onClick={() => handleIconClick(index)} className={cn("p-1 rounded-md hover:bg-muted", hasFile && "text-accent")}>
                                            <Paperclip className="h-4 w-4" />
                                        </button>
                                      </TooltipTrigger>
                                      {hasFile && (
                                        <TooltipContent>
                                          <p>{fileValue.name}</p>
                                        </TooltipContent>
                                      )}
                                    </Tooltip>
                                  </FormControl>
                                  <FormMessage />
                                  <Input 
                                      type="file" 
                                      accept=".pdf" 
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          onChange(file);
                                          // Store path if available (Electron only)
                                          if ((file as any).path) {
                                            form.setValue(`listOfDates.${lodIndex}.annexures.${index}.filePath`, (file as any).path);
                                          }
                                        }
                                      }}
                                      {...rest}
                                      ref={el => { fileInputRefs.current[index] = el; }}
                                      className="hidden"
                                  />
                              </FormItem>
                              )}
                          />
                          
                          {!isWp && (
                          <FormField
                              control={form.control}
                              name={`listOfDates.${lodIndex}.annexures.${index}.isAdditionalDocument`}
                              render={({ field }) => (
                              <FormItem className="flex flex-row items-center space-y-0 pt-1">
                                  <FormControl>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>To be checked if this annexure was not before the court below.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                  </FormControl>
                              </FormItem>
                              )}
                          />
                          )}

                          {isWp && isIoWrit && (
                          <FormField
                              control={form.control}
                              name={`listOfDates.${lodIndex}.annexures.${index}.isImpugnedOrder`}
                              render={({ field }) => (
                              <FormItem className="flex flex-row items-center gap-1 space-y-0 pt-1">
                                  <FormControl>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                        </TooltipTrigger>
                                        <TooltipContent><p>Mark as an Impugned Order (sorts to P-1; relief (a) quashes it).</p></TooltipContent>
                                    </Tooltip>
                                  </FormControl>
                                  <span className="text-[10px] text-muted-foreground">IO</span>
                              </FormItem>
                              )}
                          />
                          )}

                          {isWp && (
                          <FormField
                              control={form.control}
                              name={`listOfDates.${lodIndex}.annexures.${index}.isColly`}
                              render={({ field }) => (
                              <FormItem className="flex flex-row items-center gap-1 space-y-0 pt-1">
                                  <FormControl>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                        </TooltipTrigger>
                                        <TooltipContent><p>Colly (collectively): clubs several documents under one P-number, each bookmarked separately.</p></TooltipContent>
                                    </Tooltip>
                                  </FormControl>
                                  <span className="text-[10px] text-muted-foreground">Colly</span>
                              </FormItem>
                              )}
                          />
                          )}

                          <p className="font-medium text-xs whitespace-nowrap self-center">Annexure P-{pNumber !== undefined && pNumber}</p>
                          <p className="font-medium text-xs whitespace-nowrap self-center">is a</p>

                          <FormField
                            control={form.control}
                            name={`listOfDates.${lodIndex}.annexures.${index}.copyType`}
                            render={({ field }) => (
                              <FormItem className="min-w-[120px] flex-shrink-0">
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder="Copy type..." />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="true copy">true copy</SelectItem>
                                    <SelectItem value="typed copy">typed copy</SelectItem>
                                    <SelectItem value="true and typed copy">true and typed copy</SelectItem>
                                    <SelectItem value="translated copy">translated copy</SelectItem>
                                    <SelectItem value="true and translated copy">true and translated copy</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                          
                          {showTypedUpload && (
                            <FormField
                                control={form.control}
                                name={`listOfDates.${lodIndex}.annexures.${index}.typedOrTranslatedFile`}
                                render={({ field: { onChange, value, ...rest } }) => (
                                <FormItem>
                                    <FormControl>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button type="button" onClick={() => handleIconClick(index, true)} className={cn("p-1 rounded-md hover:bg-muted", hasTypedFile && "text-accent")}>
                                              <Paperclip className="h-4 w-4" />
                                          </button>
                                        </TooltipTrigger>
                                        {hasTypedFile && (
                                          <TooltipContent>
                                            <p>{typedFileValue.name}</p>
                                          </TooltipContent>
                                        )}
                                      </Tooltip>
                                    </FormControl>
                                    <FormMessage />
                                    <Input 
                                        type="file" 
                                        accept=".pdf" 
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            onChange(file);
                                            // Store path if available (Electron only)
                                            if ((file as any).path) {
                                              form.setValue(`listOfDates.${lodIndex}.annexures.${index}.typedOrTranslatedFilePath`, (file as any).path);
                                            }
                                          }
                                        }}
                                        {...rest}
                                        ref={el => { typedFileInputRefs.current[index] = el; }}
                                        className="hidden"
                                    />
                                </FormItem>
                                )}
                            />
                          )}

                          <p className="font-medium text-xs whitespace-nowrap self-center">of</p>
                          
                          <FormField
                            control={form.control}
                            name={`listOfDates.${lodIndex}.annexures.${index}.title`}
                            render={({ field }) => (
                              <FormItem className="flex-grow min-w-[150px]">
                                <FormControl>
                                  <Input {...field} placeholder="Description" className="h-7 text-xs"/>
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          
                          <p className="font-medium text-xs whitespace-nowrap self-center">dated</p>
                          
                          <FormField
                            control={form.control}
                            name={`listOfDates.${lodIndex}.annexures.${index}.date`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input {...field} placeholder="Date" className="w-[120px] h-7 text-xs"/>
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name={`listOfDates.${lodIndex}.annexures.${index}.customText`}
                            render={({ field }) => (
                              <FormItem className="flex-grow min-w-[100px]">
                                <FormControl>
                                  <Input {...field} placeholder="Custom text" className="h-7 text-xs"/>
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive h-6 w-6"
                              >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span className="sr-only">Remove Annexure</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will permanently delete this annexure.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => remove(index)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                        {isWp && currentAnnexure.isColly && (
                          <CollyConstituents lodIndex={lodIndex} annexIndex={index} />
                        )}
                      </CardContent>
                  </Card>
                  )
              })}
              </div>
              <div className="flex-shrink-0 pt-1 border-t flex items-center gap-2">
              <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => append(annexureSchema.parse({}))}
              >
                  <PlusCircle className="mr-1 h-3.5 w-3.5" /> Add Annexure
              </Button>
              <Select
                value={cloneSelectValue}
                onValueChange={(id) => { handleClone(id); setCloneSelectValue(""); }}
                disabled={cloneOptions.length === 0}
              >
                <SelectTrigger className="h-8 text-xs w-auto gap-1.5 px-3">
                  <Copy className="h-3.5 w-3.5 shrink-0" />
                  <SelectValue placeholder="Clone Annexure..." />
                </SelectTrigger>
                <SelectContent>
                  {cloneOptions.map(opt => (
                    <SelectItem key={opt.id} value={opt.id} className="text-xs">
                      P-{opt.pNumber}{opt.title ? ` — ${opt.title}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              </div>
          </div>
        </TooltipProvider>
        </div>
      </PopoverContent>
    </Popover>
  )
}
    
    