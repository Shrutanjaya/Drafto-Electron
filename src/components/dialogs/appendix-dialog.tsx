
"use client"

import { useRef } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import type { DraftoProject } from "@/lib/schema"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { FormControl, FormField, FormItem, FormLabel } from "../ui/form"
import { RadioGroup, RadioGroupItem } from "../ui/radio-group"
import { Input } from "../ui/input"
import { Textarea } from "../ui/textarea"
import { Checkbox } from "../ui/checkbox"
import { Paperclip } from "lucide-react"
import { cn } from "@/lib/utils"
import { pickFile } from "@/lib/utils/pick-file"

export function AppendixContent() {
  const form = useFormContext<DraftoProject>()
  const wantsAppendix = useWatch({ control: form.control, name: "wantsAppendix" });
  const useManual = form.watch("useManualAppendix");
  const appendixFile = useWatch({ control: form.control, name: "appendixFile" });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileClick = async () => {
    if (window.electron?.openFileDialog) {
      const file = await pickFile();
      if (file) {
        form.setValue('appendixFile', file, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
        form.setValue('appendixFilePath', (file as any).path);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const hasFile = appendixFile instanceof File;

  return (
    <div className="space-y-2 py-1">
      <FormField
        control={form.control}
        name="wantsAppendix"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center space-x-2 space-y-0">
            <FormControl>
              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
            <FormLabel className="font-normal text-xs">
              I want to include an Appendix.
            </FormLabel>
          </FormItem>
        )}
      />
      <fieldset disabled={!wantsAppendix} className="space-y-1 group-disabled:opacity-50 group-disabled:blur-sm">
        <FormField
          control={form.control}
          name="useManualAppendix"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="text-xs">How would you like to provide the appendix?</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={(value) => field.onChange(value === "true")}
                  value={String(field.value)}
                  className="flex space-x-2"
                >
                  <FormItem className="flex items-center space-x-1 space-y-0">
                    <FormControl><RadioGroupItem value="false" /></FormControl>
                    <FormLabel className="font-normal text-xs">Upload PDF</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-1 space-y-0">
                    <FormControl><RadioGroupItem value="true" /></FormControl>
                    <FormLabel className="font-normal text-xs">Enter Manually</FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
            </FormItem>
          )}
        />
        {useManual ? (
          <FormField
            control={form.control}
            name="appendixManualEntry"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Paste Appendix text here:</FormLabel>
                <FormControl>
                  <Textarea className="min-h-[150px] text-xs" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        ) : (
          <FormField
            control={form.control}
            name="appendixFile"
            render={({ field: { onChange, value, ...rest } }) => (
              <FormItem>
                <FormLabel className="text-xs">Upload Appendix PDF</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleFileClick}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-xs",
                        hasFile && "border-accent text-accent"
                      )}
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      {hasFile ? appendixFile.name : "Choose PDF"}
                    </button>
                    <Input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          onChange(file);
                          if ((file as any).path) {
                            form.setValue('appendixFilePath', (file as any).path);
                          }
                        }
                      }}
                      {...rest}
                      ref={fileInputRef}
                      className="hidden"
                    />
                  </div>
                </FormControl>
              </FormItem>
            )}
          />
        )}
        <FormField
          control={form.control}
          name="appendixDescription"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">The Appendix contains provisions of</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Indian Penal Code, 1860 and Bharatiya Nyaya Sanhita, 2023" />
              </FormControl>
            </FormItem>
          )}
        />
      </fieldset>
    </div>
  )
}

export function AppendixDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Appendix</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Appendix</DialogTitle>
        </DialogHeader>
        <AppendixContent />
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" size="sm">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


