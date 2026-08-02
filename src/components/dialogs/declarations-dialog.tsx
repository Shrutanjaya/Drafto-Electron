
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

// The Declaration rule numbers depend on the SLP type: Criminal SLPs cite
// Rule 2(2) & Rule 4 (Order XXII); Civil cite Rule 3(2) & Rule 5 (Order XXI).
const declarationItemsFor = (isCriminal: boolean) => [
    { name: "declarations.noOtherSLPFiled" as const, label: `No other SLP has been filed by the Petitioner against the same impugned judgment/order. [Rule ${isCriminal ? "2(2)" : "3(2)"}]` },
    { name: "declarations.annexuresTrueCopies" as const, label: `The annexures along with the SLP are true copies of the pleadings/documents forming part of the record of the earlier court. [Rule ${isCriminal ? "4" : "5"}]` },
];

const certificateItems = [
    { name: "aorCertificate.confinedToPleadings", label: "The SLP is confined to the pleadings and documents which were before the earlier court. No additional facts, documents or grounds are taken in the SLP, except those in respect of which an application seeking permission is filed." },
    { name: "aorCertificate.annexuresNecessary", label: "The annexures to the SLP are necessary to answer the questions of law raised in the petition or make out the grounds urged in the SLP." },
    { name: "aorCertificate.basedOnInstructions", label: "This Certificate is given based on the deponent’s instructions." },
] as const;


export function DeclarationsContent() {
  const form = useFormContext<DraftoProject>()
  const caseType = useWatch({ control: form.control, name: "caseType" })
  const declarationItems = declarationItemsFor(caseType === "Criminal")
  return (
    <div className="space-y-2 py-1">
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">DECLARATIONS BY THE PETITIONER:</h4>
        <div className="space-y-1">
          {declarationItems.map(item => (
            <FormField
              key={item.name}
              control={form.control}
              name={item.name}
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-2 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="font-normal text-xs">{item.label}</FormLabel>
                </FormItem>
              )}
            />
          ))}
        </div>
      </div>
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">CERTIFICATE BY THE AOR:</h4>
        <div className="space-y-1">
          {certificateItems.map(item => (
            <FormField
              key={item.name}
              control={form.control}
              name={item.name}
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-2 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="font-normal text-xs">{item.label}</FormLabel>
                </FormItem>
              )}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function DeclarationsDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Declarations</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Declarations and Certificate</DialogTitle>
        </DialogHeader>
        <DeclarationsContent />
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" size="sm">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
