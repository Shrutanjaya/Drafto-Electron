
"use client"

import React, { useRef } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";
import { iaAnnexureSchema, type DraftoProject } from "@/lib/schema";
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
import { Card, CardContent } from "../ui/card";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { pickFile } from "@/lib/utils/pick-file";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface IaAnnexureDialogProps {
  groundIndex: number;
  nestingKey: `standardIas.condonationOfDelay.grounds` | `customIas.${number}.grounds`;
  children: React.ReactElement;
  annexureNumberingMap: Map<string, number>;
}

export function IaAnnexureDialog({ groundIndex, nestingKey, children, annexureNumberingMap }: IaAnnexureDialogProps) {
  const form = useFormContext<DraftoProject>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: `${nestingKey}.${groundIndex}.annexures`,
  });
  
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleIconClick = async (index: number) => {
    if (window.electron?.openFileDialog) {
      const file = await pickFile();
      if (file) {
        form.setValue(`${nestingKey}.${groundIndex}.annexures.${index}.file`, file, { shouldValidate: true, shouldDirty: true });
        form.setValue(`${nestingKey}.${groundIndex}.annexures.${index}.filePath`, (file as any).path);
      }
    } else {
      // Fallback to browser file input
      fileInputRefs.current[index]?.click();
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="max-w-[90vw] w-full md:max-w-4xl p-2" side="bottom" align="end">
        <TooltipProvider>
        <div className="flex flex-col h-full">
            <div className="flex-grow overflow-y-auto pr-1 space-y-1 py-2 max-h-[60vh]">
            {fields.map((item, index) => {
                const currentAnnexure = form.watch(`${nestingKey}.${groundIndex}.annexures.${index}`);
                const aNumber = currentAnnexure ? annexureNumberingMap.get(currentAnnexure.id) : undefined;
                const fileValue = form.watch(`${nestingKey}.${groundIndex}.annexures.${index}.file`);
                const hasFile = fileValue instanceof File;

                return (
                <Card key={item.id} className="relative">
                    <CardContent className="p-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <FormField
                            control={form.control}
                            name={`${nestingKey}.${groundIndex}.annexures.${index}.file`}
                            render={({ field: { onChange, value, ...rest } }) => (
                            <FormItem>
                                <FormControl>
                                    <div>
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
                                        <Input 
                                            type="file" 
                                            accept=".pdf" 
                                            onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              if (file) {
                                                onChange(file);
                                                // Store path if available (Electron only)
                                                if ((file as any).path) {
                                                  form.setValue(`${nestingKey}.${groundIndex}.annexures.${index}.filePath`, (file as any).path);
                                                }
                                              }
                                            }}
                                            {...rest}
                                            ref={el => { fileInputRefs.current[index] = el; }}
                                            className="hidden"
                                        />
                                    </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        
                        <p className="font-medium text-sm whitespace-nowrap self-center">Annexure A-{aNumber !== undefined && aNumber}</p>
                        <p className="font-medium text-sm whitespace-nowrap self-center">is a</p>
                        
                        <FormField
                          control={form.control}
                          name={`${nestingKey}.${groundIndex}.annexures.${index}.title`}
                          render={({ field }) => (
                            <FormItem className="flex-grow min-w-[150px]">
                              <FormControl>
                                <Input {...field} placeholder="Description" className="h-7 text-sm"/>
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        
                        <p className="font-medium text-sm whitespace-nowrap self-center">dated</p>
                        
                        <FormField
                          control={form.control}
                          name={`${nestingKey}.${groundIndex}.annexures.${index}.date`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input {...field} placeholder="Date" className="w-[120px] h-7 text-sm"/>
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
                onClick={() => append(iaAnnexureSchema.parse({}))}
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

    