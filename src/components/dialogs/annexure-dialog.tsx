
"use client"

import React, { useMemo, useRef } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { annexureSchema, type DraftoProject } from "@/lib/schema";
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
import { PlusCircle, Trash2, Paperclip } from "lucide-react";
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
import { pickFile } from "@/lib/utils/pick-file";

interface AnnexureDialogProps {
  lodIndex: number;
  children: React.ReactElement;
  annexureNumberingMap: Map<string, number>;
}

export function AnnexureDialog({ lodIndex, children, annexureNumberingMap }: AnnexureDialogProps) {
  const form = useFormContext<DraftoProject>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: `listOfDates.${lodIndex}.annexures`,
  });
  
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const typedFileInputRefs = useRef<(HTMLInputElement | null)[]>([]);


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
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="max-w-[90vw] w-full md:max-w-7xl p-2" side="bottom" align="end">
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
                      </CardContent>
                  </Card>
                  )
              })}
              </div>
              <div className="flex-shrink-0 pt-1 border-t flex justify-between">
              <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => append(annexureSchema.parse({}))}
              >
                  <PlusCircle className="mr-1 h-3.5 w-3.5" /> Add Annexure
              </Button>
              </div>
          </div>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  )
}
    
    