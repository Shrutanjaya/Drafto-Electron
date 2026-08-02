"use client";

import { useRef, useState } from "react";
import { useFormContext } from "react-hook-form";
import { FileDiff, Loader2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { DraftoProject } from "@/lib/schema";
import {
  parseTrackedChanges,
  matchChanges,
  applyChangeToValue,
  type MatchedChange,
} from "@/lib/tracked-changes";

// When `open`/`onOpenChange` are supplied the dialog is controlled and renders
// no trigger of its own (it lives inside the DOCX menu). Left uncontrolled, it
// renders its standalone icon trigger.
interface ImportChangesDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ImportChangesDialog({ open: controlledOpen, onOpenChange }: ImportChangesDialogProps = {}) {
  const form = useFormContext<DraftoProject>();
  const { toast } = useToast();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (o: boolean) => { if (isControlled) onOpenChange?.(o); else setUncontrolledOpen(o); };
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [results, setResults] = useState<MatchedChange[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setResults(null); setFileName(""); };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setFileName(file.name);
    setLoading(true);
    setResults(null);
    try {
      const buf = await file.arrayBuffer();
      const changes = await parseTrackedChanges(buf);
      setResults(matchChanges(form.getValues(), changes));
    } catch (err) {
      toast({ variant: "destructive", title: "Couldn't read that file", description: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  const matched = (results ?? []).filter((r) => r.path);
  const unmatched = (results ?? []).filter((r) => !r.path);

  const applyAll = () => {
    let applied = 0;
    for (const r of matched) {
      const cur = form.getValues(r.path as any);
      if (typeof cur !== "string") continue;
      const next = applyChangeToValue(cur, !!r.isHtml, r);
      if (next !== cur) {
        form.setValue(r.path as any, next, { shouldDirty: true });
        applied += 1;
      }
    }
    toast({
      title: applied > 0 ? `Applied ${applied} change${applied === 1 ? "" : "s"}` : "Nothing applied",
      description: applied > 0 ? "Review the affected tabs, then save your project." : "The matched text no longer appears in those fields.",
    });
    setOpen(false);
    reset();
  };

  const authors = Array.from(new Set((results ?? []).flatMap((r) => r.authors)));

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" title="Import tracked changes from an edited draft">
            <FileDiff className="h-5 w-5" />
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import tracked changes</DialogTitle>
          <DialogDescription className="text-xs">
            Upload a .docx that came back with tracked changes. Drafto reads each revision and applies it to the matching field. Nothing is saved until you save the project.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => fileRef.current?.click()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Choose .docx
          </Button>
          {fileName && <span className="text-xs text-muted-foreground truncate">{fileName}</span>}
          <input ref={fileRef} type="file" accept=".docx" onChange={handleFile} className="hidden" />
        </div>

        {results && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {results.length === 0
                ? "No tracked changes found in that file. (If the edits weren't made with Track Changes on, they can't be detected.)"
                : `${results.length} change${results.length === 1 ? "" : "s"} found · ${matched.length} matched to fields${unmatched.length ? ` · ${unmatched.length} not matched` : ""}${authors.length ? ` · by ${authors.join(", ")}` : ""}.`}
            </p>

            <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
              {matched.map((r) => (
                <div key={r.id} className="rounded-md border p-2 text-[11px] leading-relaxed">
                  <div className="text-[10px] font-medium text-muted-foreground mb-0.5">{r.group}</div>
                  {r.original && <div><span className="line-through text-red-600 dark:text-red-400">{r.original}</span></div>}
                  {r.accepted && <div><span className="text-green-700 dark:text-green-400">{r.accepted}</span></div>}
                </div>
              ))}
              {unmatched.length > 0 && (
                <div className="rounded-md border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 p-2 text-[10px] text-amber-800 dark:text-amber-200 space-y-1">
                  <p className="font-medium">Couldn't locate {unmatched.length} change{unmatched.length === 1 ? "" : "s"} in your project (edited text no longer matches, spans formatting, or is in a table):</p>
                  {unmatched.map((r) => (
                    <div key={r.id} className="truncate">• {r.accepted || r.original}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" onClick={applyAll} disabled={matched.length === 0}>
            Apply {matched.length} matched change{matched.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
