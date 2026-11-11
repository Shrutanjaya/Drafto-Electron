"use client"

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
import { AamTable } from "../custom/aam-table"
import { MayurButton } from "../custom/mayur-button"

export function QuestionsOfLawDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Questions of Law</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px] max-h-[85vh] flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between pr-6 space-y-0 shrink-0">
          <DialogTitle>Questions of Law</DialogTitle>
          <MayurButton section="qol" />
        </DialogHeader>
        <div className="py-1 overflow-y-auto flex-1 min-h-0 pr-1">
          <AamTable name="questionsOfLaw" defaultRows={10} />
        </div>
        <DialogFooter className="shrink-0 pt-2">
          <DialogClose asChild>
            <Button type="button" size="sm">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
