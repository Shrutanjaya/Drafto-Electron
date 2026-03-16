
"use client"

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
import { Checkbox } from "../ui/checkbox"
import { AamTable } from "../custom/aam-table"

export function InterimReliefContent() {
  const form = useFormContext<DraftoProject>()
  const wantsRelief = useWatch({
    control: form.control,
    name: "wantsInterimRelief",
  })
  return (
    <div className="space-y-1 py-1">
      <FormField
        control={form.control}
        name="wantsInterimRelief"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center space-x-2 space-y-0">
            <FormControl>
              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
            <FormLabel className="font-normal text-xs">
              I want to seek interim relief in this SLP.
            </FormLabel>
          </FormItem>
        )}
      />
      <div className="space-y-1">
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Grounds for Interim Relief</h4>
          <AamTable name="interimReliefGrounds" defaultRows={5} disabled={!wantsRelief} />
        </div>
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Prayers for Interim Relief</h4>
          <AamTable name="interimReliefPrayers" defaultRows={2} disabled={!wantsRelief} />
        </div>
      </div>
    </div>
  )
}

export function InterimReliefDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Interim Relief</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Interim Relief</DialogTitle>
        </DialogHeader>
        <InterimReliefContent />
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" size="sm">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
