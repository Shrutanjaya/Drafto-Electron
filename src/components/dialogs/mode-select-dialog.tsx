"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Landmark, Scale } from "lucide-react";
import type { DraftoProject } from "@/lib/schema";

interface ModeSelectDialogProps {
  open: boolean;
  onSelect: (courtType: DraftoProject["courtType"]) => void;
}

// Startup / "New Project" prompt: the user chooses what they want to draft.
// Controlled open with no onOpenChange — a choice is required to dismiss, so the
// app never sits in an undecided state. The chosen value drives `courtType`,
// which the Workspace branches on to load the matching interface.
export function ModeSelectDialog({ open, onSelect }: ModeSelectDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-lg" showClose={false}>
        <DialogHeader>
          <DialogTitle>What would you like to draft?</DialogTitle>
          <DialogDescription>
            Choose a document type to begin. You can start a different type at any
            time via File → New Project.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="flex h-auto flex-col items-start gap-1 whitespace-normal p-4 text-left"
            onClick={() => onSelect("SLP")}
          >
            <span className="flex items-center gap-2 font-semibold">
              <Scale className="h-4 w-4 shrink-0" />
              Special Leave Petition
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              Supreme Court of India
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex h-auto flex-col items-start gap-1 whitespace-normal p-4 text-left"
            onClick={() => onSelect("WritPetitionDHC")}
          >
            <span className="flex items-center gap-2 font-semibold">
              <Landmark className="h-4 w-4 shrink-0" />
              Writ Petition
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              High Court of Delhi at New Delhi
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
