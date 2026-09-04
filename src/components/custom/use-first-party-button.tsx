"use client"

// "Same as Petitioner No. 1" — fills the deponent's particulars from the first
// party, which is who swears the affidavit in most petitions. Only the fields
// the party record actually holds are written, so nothing already entered is
// blanked by a field the party has nothing to say about.

import { useFormContext, useWatch } from "react-hook-form"
import type { DraftoProject } from "@/lib/schema"
import { Button } from "@/components/ui/button"
import { UserRoundCheck } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { deponentFromParty, firstNamedParty } from "@/lib/deponent-from-party"

export function UseFirstPartyButton() {
  const form = useFormContext<DraftoProject>()
  const { toast } = useToast()
  const petitioners = useWatch({ control: form.control, name: "petitioners" })
  const courtType = useWatch({ control: form.control, name: "courtType" })

  const party = firstNamedParty({ petitioners } as Partial<DraftoProject>)
  const noun = courtType === "OriginalApplicationCAT" ? "Applicant" : "Petitioner"

  const apply = () => {
    const fill = deponentFromParty(form.getValues())
    if (!fill) return
    for (const [key, value] of Object.entries(fill)) {
      if (value === undefined) continue
      form.setValue(`deponent.${key}` as any, value as any, { shouldDirty: true, shouldTouch: true })
    }
    const filled = Object.entries(fill).filter(([, v]) => v !== undefined).length
    toast({
      title: `Taken from ${noun} No. 1`,
      description: `${filled} field${filled === 1 ? "" : "s"} filled from ${fill.name}. Anything the party record does not carry is left as it was.`,
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-6 gap-1 px-2 text-[11px]"
      onClick={apply}
      disabled={!party}
      title={party ? `Fill the deponent's particulars from ${party.name}` : `Enter ${noun} No. 1 first`}
    >
      <UserRoundCheck className="h-3 w-3" />
      Same as {noun} No. 1
    </Button>
  )
}
