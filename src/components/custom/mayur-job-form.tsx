"use client";

// ── Mayur's job form ─────────────────────────────────────────────────────────
// Three plain questions — what to draft, what to read, and what to do about
// anything already written — built entirely from the section registry, so it
// works for every document type without knowing anything about any of them.

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, FolderOpen, Loader2, Sparkles } from "lucide-react";
import type { DraftMode } from "@/lib/ai/field-catalog";
import { sectionsByTab, type Section } from "@/lib/ai/sections";
import type { OverwritePolicy } from "@/lib/ai/job";
import { rolesFor } from "@/lib/ai/document-roles";

export interface JobFormState {
  draft: string[];
  read: string[];
  overwrite: OverwritePolicy;
  extra: string;
}

const SegButton = ({
  active,
  onClick,
  children,
  disabled,
}: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "rounded px-2 py-1 text-[11px] transition-colors disabled:opacity-40",
      active ? "bg-primary font-medium text-primary-foreground dark:text-white" : "text-muted-foreground hover:text-foreground",
    )}
  >
    {children}
  </button>
);

export function MayurJobForm({
  mode,
  filled,
  state,
  onChange,
  onRun,
  running,
  hasFolder,
  onPickFolder,
  planCount,
  estimateLabel,
  files,
  roles,
  onRoleChange,
}: {
  mode: DraftMode;
  filled: Set<string>;
  state: JobFormState;
  onChange: (next: JobFormState) => void;
  onRun: () => void;
  running: boolean;
  hasFolder: boolean;
  onPickFolder: () => void;
  planCount: number;
  estimateLabel: string | null;
  /** Source files found in the chosen folder. */
  files: { name: string; pageCount: number; scanned: number }[];
  /** file name → role id ("" = not set, "exclude" = don't read). */
  roles: Record<string, string>;
  onRoleChange: (file: string, role: string) => void;
}) {
  const groups = sectionsByTab(mode);
  const all = groups.flatMap((g) => g.sections);

  const set = (patch: Partial<JobFormState>) => onChange({ ...state, ...patch });
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const draftAll = () => set({ draft: all.map((s) => s.id) });
  const draftEmpty = () => set({ draft: all.filter((s) => !filled.has(s.id)).map((s) => s.id) });
  const draftNone = () => set({ draft: [] });

  const selectedFilled = state.draft.filter((id) => filled.has(id));
  const needsDocuments = all.some((s) => state.draft.includes(s.id) && s.needsDocuments);

  const Row = ({ sec }: { sec: Section }) => {
    const drafting = state.draft.includes(sec.id);
    const reading = state.read.includes(sec.id);
    const isFilled = filled.has(sec.id);
    return (
      <div className="flex items-start gap-2 rounded px-1 py-1 hover:bg-muted/40">
        <button
          type="button"
          onClick={() => set({ draft: toggle(state.draft, sec.id) })}
          className="mt-0.5 shrink-0"
          aria-label={drafting ? `Don't draft ${sec.label}` : `Draft ${sec.label}`}
        >
          {drafting ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn("text-xs", drafting ? "font-medium" : "text-muted-foreground")}>{sec.label}</span>
            {isFilled && (
              <span className="rounded-full border border-green-500/40 bg-green-500/10 px-1.5 text-[9px] text-green-700 dark:text-green-400">
                written
              </span>
            )}
          </div>
          {sec.hint && <p className="truncate text-[10px] text-muted-foreground/80">{sec.hint}</p>}
        </div>
        {/* Reading a section only makes sense when it has something in it. */}
        <button
          type="button"
          disabled={!isFilled}
          onClick={() => set({ read: toggle(state.read, sec.id) })}
          className={cn(
            "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] transition-colors",
            !isFilled
              ? "cursor-not-allowed text-muted-foreground/30"
              : reading
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground",
          )}
          title={isFilled ? "Read this as context" : "Nothing written here yet"}
        >
          read
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* ── Draft what? ── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Draft</p>
          <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
            <SegButton active={state.draft.length === all.length} onClick={draftAll}>Everything</SegButton>
            <SegButton
              active={state.draft.length > 0 && state.draft.every((id) => !filled.has(id)) && state.draft.length === all.length - filled.size}
              onClick={draftEmpty}
            >
              What's missing
            </SegButton>
            <SegButton active={state.draft.length === 0} onClick={draftNone}>None</SegButton>
          </div>
        </div>

        <div className="max-h-[220px] space-y-2 overflow-y-auto rounded-md border p-1.5">
          {groups.map((g) => (
            <div key={g.tab}>
              <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{g.tab}</p>
              {g.sections.map((s) => <Row key={s.id} sec={s} />)}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Tick to draft. Tap <span className="font-medium">read</span> on anything already written to have Mayur use it as context.
        </p>
      </div>

      {/* ── Sources ── */}
      {needsDocuments && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={onPickFolder}>
              <FolderOpen className="h-3.5 w-3.5" />
              {hasFolder ? "Change documents" : "Choose documents"}
            </Button>
            {!hasFolder && (
              <span className="text-[10px] text-amber-600 dark:text-amber-500">
                Some of what you picked needs the source documents.
              </span>
            )}
          </div>

          {files.length > 0 && (
            <div className="max-h-[140px] space-y-0.5 overflow-y-auto rounded-md border p-1.5">
              {files.map((f) => (
                <div key={f.name} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px]">{f.name}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {f.pageCount} page{f.pageCount === 1 ? "" : "s"}
                      {f.scanned > 0 ? ` · ${f.scanned} scanned` : ""}
                    </p>
                  </div>
                  <select
                    value={roles[f.name] ?? ""}
                    onChange={(e) => onRoleChange(f.name, e.target.value)}
                    className="h-6 w-[150px] shrink-0 rounded border bg-background px-1 text-[10px]"
                  >
                    <option value="">What is this?</option>
                    {rolesFor(mode).map((r) => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                    <option value="exclude">— Don't read this —</option>
                  </select>
                </div>
              ))}
              <p className="pt-0.5 text-[9px] text-muted-foreground">
                Only the order under challenge really needs setting. Excluding what you don't need makes the run quicker and cheaper.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Already written? ── */}
      {selectedFilled.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 dark:border-amber-700/60 dark:bg-amber-900/20">
          <p className="text-[11px] text-amber-800 dark:text-amber-300">
            {selectedFilled.length} of the {state.draft.length} you picked already {selectedFilled.length === 1 ? "has" : "have"} content.
          </p>
          <div className="inline-flex rounded-md border bg-background/60 p-0.5">
            <SegButton active={state.overwrite === "skip"} onClick={() => set({ overwrite: "skip" })}>Leave mine alone</SegButton>
            <SegButton active={state.overwrite === "replace"} onClick={() => set({ overwrite: "replace" })}>Replace</SegButton>
            <SegButton active={state.overwrite === "both"} onClick={() => set({ overwrite: "both" })}>Show me both</SegButton>
          </div>
        </div>
      )}

      {/* ── Extra instructions ── */}
      <Textarea
        rows={2}
        value={state.extra}
        onChange={(e) => set({ extra: e.target.value })}
        placeholder="Anything else Mayur should know — e.g. “the Petitioner was Respondent No. 2 below”, “keep the grounds to six”."
        className="text-xs"
      />

      {/* ── Go ── */}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" disabled={running || planCount === 0} onClick={onRun}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {running ? "Drafting…" : planCount === 0 ? "Nothing selected" : `Draft ${planCount} section${planCount === 1 ? "" : "s"}`}
        </Button>
        {estimateLabel && !running && <span className="text-[10px] text-muted-foreground">about {estimateLabel}</span>}
      </div>
    </div>
  );
}
