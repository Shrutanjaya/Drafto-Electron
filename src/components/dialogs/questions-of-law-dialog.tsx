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

export function QuestionsOfLawDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Questions of Law</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Questions of Law</DialogTitle>
        </DialogHeader>
        <div className="py-1">
          <AamTable name="questionsOfLaw" defaultRows={10} />
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
