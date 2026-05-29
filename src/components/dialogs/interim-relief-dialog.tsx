
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
  const wantsRelief = useWatch({ control: form.control, name: "wantsInterimRelief" })
  const impugnedOrders = useWatch({ control: form.control, name: "impugnedOrders" })

  const buildStayPrayer = (): string => {
    if (!impugnedOrders || impugnedOrders.length === 0) {
      return "Stay the effect and operation of the Impugned [Order Type] dated [date] passed by the [Court] in [Case No.]"
    }
    const order = impugnedOrders[0]
    const courtName = order.court === "Other" ? order.customCourt : order.court
    const orderDate = order.date ? new Date(order.date).toLocaleDateString("en-GB") : "[date]"
    return `Stay the effect and operation of the Impugned ${order.type || "[Order Type]"} dated ${orderDate} passed by the ${courtName || "[Court]"} in ${order.caseNumber || "[Case No.]"}`
  }

  const handleInsertStay = () => {
    const stayText = buildStayPrayer()
    const prayers = form.getValues("interimReliefPrayers")

    if (!prayers || prayers.length === 0) {
      form.setValue("interimReliefPrayers", [{ id: `item_${Math.random()}`, particulars: stayText }], { shouldDirty: true })
      return
    }

    if (prayers[0].particulars.trim() === "") {
      // Prayer A is blank — fill it in place
      const updated = prayers.map((p, i) => i === 0 ? { ...p, particulars: stayText } : p)
      form.setValue("interimReliefPrayers", updated, { shouldDirty: true })
    } else {
      // Prayer A already has content — insert a new row after Prayer A
      const newItem = { id: `item_${Math.random()}`, particulars: stayText }
      const updated = [prayers[0], newItem, ...prayers.slice(1)]
      form.setValue("interimReliefPrayers", updated, { shouldDirty: true })
    }
  }

  return (
    <div className="space-y-1 py-1">
      <FormField
        control={form.control}
        name="wantsInterimRelief"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-end space-x-2 space-y-0">
            <FormLabel className="font-normal text-xs cursor-pointer">
              Include
            </FormLabel>
            <FormControl>
              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />
      <div className="space-y-1">
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Grounds for Interim Relief</h4>
          <AamTable name="interimReliefGrounds" defaultRows={5} disabled={!wantsRelief} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prayers for Interim Relief</h4>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={handleInsertStay}
              disabled={!wantsRelief}
            >
              Insert Stay
            </Button>
          </div>
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
