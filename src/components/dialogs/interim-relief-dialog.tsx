
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
import { useEffect } from "react"
import { useCalculatedValues } from "@/hooks/use-calculated-values"

export function InterimReliefDialog() {
  const form = useFormContext<DraftoProject>()
  const { ioText } = useCalculatedValues();

  const wantsRelief = useWatch({
    control: form.control,
    name: "wantsInterimRelief",
  })

  useEffect(() => {
      const currentPrayers = form.getValues("interimReliefPrayers");
      
      const newPrayerText = `Stay the operation and effect of ${ioText}`;

      // Find the prayer that is meant to be dynamic. 
      // Let's assume it's the one starting with "Stay the operation".
      const prayerIndex = currentPrayers.findIndex(p => p.particulars.startsWith("Stay the operation"));
      
      if (prayerIndex !== -1) {
          const prayerToUpdate = currentPrayers[prayerIndex];
          if (prayerToUpdate.particulars !== newPrayerText) {
              const updatedPrayers = [...currentPrayers];
              updatedPrayers[prayerIndex] = { ...prayerToUpdate, particulars: newPrayerText };
              form.setValue("interimReliefPrayers", updatedPrayers, { shouldDirty: true });
          }
      } else {
        // If no prayer is found (e.g., it's blank), we could decide to set the first one.
        // For now, we only update if a specific pattern is matched.
      }
  }, [ioText, form]);


  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Interim Relief</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Interim Relief</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 py-1">
            <FormField
              control={form.control}
              name="wantsInterimRelief"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="font-normal text-xs">
                    I want to seek interim relief in this SLP.
                  </FormLabel>
                </FormItem>
              )}
            />
            
            <div className="space-y-1">
                <div>
                    <h4 className="font-bold text-xs mb-1">Grounds for Interim Relief</h4>
                    <AamTable name="interimReliefGrounds" defaultRows={5} disabled={!wantsRelief} />
                </div>
                 <div>
                    <h4 className="font-bold text-xs mb-1">Prayers for Interim Relief</h4>
                    <AamTable name="interimReliefPrayers" defaultRows={2} disabled={!wantsRelief} />
                </div>
            </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" size="sm">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
