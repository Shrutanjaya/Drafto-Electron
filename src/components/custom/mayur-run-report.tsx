"use client";

// ── The run report ───────────────────────────────────────────────────────────
// What happened, section by section, and the single "Needs you" list gathered
// from every pass. Shown while the run is in flight and left on screen after it
// finishes, so the user can act on it in their own time.

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, Undo2, XCircle } from "lucide-react";
import { GAP_REASON_LABEL, groupGaps, summariseGaps, type Gap } from "@/lib/ai/gaps";

export type PassStatus = "waiting" | "running" | "done" | "failed" | "skipped";

export interface PassResult {
  sectionId: string;
  label: string;
  status: PassStatus;
  /** Fields written by this pass. */
  changed: number;
  note?: string;
}

export function MayurRunReport({
  passes,
  gaps,
  running,
  canUndo,
  onUndo,
  onRedoSection,
}: {
  passes: PassResult[];
  gaps: Gap[];
  running: boolean;
  canUndo: boolean;
  onUndo: () => void;
  onRedoSection: (sectionId: string) => void;
}) {
  if (passes.length === 0) return null;
  const done = passes.filter((p) => p.status === "done").length;
  const failed = passes.filter((p) => p.status === "failed").length;
  const written = passes.reduce((n, p) => n + p.changed, 0);

  const icon = (s: PassStatus) => {
    if (s === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
    if (s === "done") return <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />;
    if (s === "failed") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    if (s === "skipped") return <span className="text-[10px] text-muted-foreground">—</span>;
    return <span className="inline-block h-3.5 w-3.5 rounded-full border border-muted-foreground/30" />;
  };

  return (
    <div className="space-y-3">
      {/* Progress */}
      <div className="space-y-1 rounded-md border p-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {running ? "Drafting" : "Done"}
          </p>
          <span className="text-[10px] text-muted-foreground">
            {done} of {passes.length}{failed > 0 ? ` · ${failed} failed` : ""}
          </span>
        </div>
        {passes.map((p) => (
          <div key={p.sectionId} className="flex items-center gap-2 py-0.5">
            <span className="w-4 shrink-0">{icon(p.status)}</span>
            <span className={cn("flex-1 truncate text-xs", p.status === "waiting" && "text-muted-foreground/60")}>{p.label}</span>
            {p.status === "done" && p.changed > 0 && (
              <span className="text-[10px] text-muted-foreground">{p.changed} field{p.changed === 1 ? "" : "s"}</span>
            )}
            {p.note && p.status === "failed" && <span className="max-w-[140px] truncate text-[10px] text-destructive">{p.note}</span>}
            {!running && (p.status === "done" || p.status === "failed") && (
              <button
                type="button"
                onClick={() => onRedoSection(p.sectionId)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                title={`Redo ${p.label}`}
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}

        {!running && (
          <div className="flex items-center justify-between border-t pt-1.5">
            <span className="text-[10px] text-muted-foreground">
              {written} field{written === 1 ? "" : "s"} filled — nothing is saved until you save the project.
            </span>
            {canUndo && (
              <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-[10px]" onClick={onUndo}>
                <Undo2 className="h-3 w-3" /> Undo this run
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Needs you */}
      {gaps.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 dark:border-amber-700/60 dark:bg-amber-900/20">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Needs you — {summariseGaps(gaps)}
          </p>
          {groupGaps(gaps).map((g) => (
            <div key={g.tab} className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800/70 dark:text-amber-300/70">{g.tab}</p>
              {g.gaps.map((gap, i) => (
                <div key={`${gap.sectionId}-${i}`} className="pl-1 text-[11px] leading-snug text-amber-900/90 dark:text-amber-200/90">
                  <span className="font-medium">{gap.field}</span>
                  <span className="text-amber-800/70 dark:text-amber-300/70"> · {GAP_REASON_LABEL[gap.reason]}</span>
                  <div className="text-amber-900/80 dark:text-amber-200/80">{gap.detail}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
