"use client";

import { useState, useEffect, useRef } from "react";
import { useFormContext } from "react-hook-form";
import { Search, X, ChevronDown, Check, ArrowUp, ArrowDown, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  SEARCH_GROUPS,
  buildMatchList,
  replaceAllInForm,
  replaceNth,
  GROUP_TO_TAB,
  GROUP_TO_SLP_SECTION,
  type SearchGroup,
  type NavMatch,
} from "@/lib/find-replace";
import {
  FIND_REVEAL_EVENT,
  setPendingReveal,
  revealPlainInput,
} from "@/lib/find-reveal";
import { useFieldReveal } from "./field-reveal-provider";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

const EDGE_CASE_TOOLTIP =
  "What Find might miss:\n" +
  "• A word split by formatting — e.g. if half of it is bold or italic — isn't found as one word.\n" +
  "• The symbols &, < and > are stored in a special way, so searching for them on their own may not find them.";

// Word-style Find & Replace, scoped to the Petition project form. Opens with
// Ctrl/Cmd+F. An empty group selection means "all sections". Matches are
// navigated one-by-one with on-screen highlighting.
export function FindReplaceBar() {
  const form = useFormContext();
  const { toast } = useToast();
  const fieldReveal = useFieldReveal();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [showScope, setShowScope] = useState(false);
  const [matches, setMatches] = useState<NavMatch[]>([]);
  const [current, setCurrent] = useState(-1);

  const findInputRef = useRef<HTMLInputElement>(null);
  const scopeRef = useRef<HTMLDivElement>(null);

  // Ctrl/Cmd+F opens (and focuses) the bar; Escape closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => { findInputRef.current?.focus(); findInputRef.current?.select(); }, 0);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
        setShowScope(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Close the scope dropdown on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (scopeRef.current && !scopeRef.current.contains(e.target as Node)) setShowScope(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const groupsFilter = selectedGroups.size === 0 ? null : selectedGroups;
  const groupsKey = [...selectedGroups].sort().join('|');

  // Rebuild the ordered match list whenever the query, options, or scope change.
  const refreshMatches = (resetIndex = true) => {
    const list = query ? buildMatchList(form.getValues(), query, { caseSensitive }, groupsFilter) : [];
    setMatches(list);
    if (resetIndex) setCurrent(-1);
    return list;
  };
  useEffect(() => {
    if (!open) return;
    refreshMatches(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, caseSensitive, groupsKey]);

  if (!open) return null;

  const toggleGroup = (g: SearchGroup) =>
    setSelectedGroups(prev => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });

  // Switch to the match's tab/section, then highlight it (retrying while the
  // target mounts). Rich-text fields go through the editor registry; plain
  // fields are located by their input `name`.
  const revealAt = (list: NavMatch[], index: number) => {
    const m = list[index];
    if (!m) return;
    setPendingReveal({
      tab: GROUP_TO_TAB[m.group],
      section: GROUP_TO_SLP_SECTION[m.group],
      path: m.path,
      occurrence: m.occurrence,
      isHtml: m.isHtml,
      query,
      caseSensitive,
    });
    window.dispatchEvent(new CustomEvent(FIND_REVEAL_EVENT));

    let attempts = 0;
    const tryReveal = () => {
      attempts++;
      const ok = m.isHtml
        ? (fieldReveal?.reveal(m.path, query, caseSensitive, m.occurrence) ?? false)
        : revealPlainInput(m.path, query, caseSensitive, m.occurrence);
      if (ok || attempts >= 20) { setPendingReveal(null); return; }
      setTimeout(tryReveal, 60);
    };
    setTimeout(tryReveal, 80);
  };

  const goTo = (delta: number) => {
    if (matches.length === 0) return;
    const next = current < 0
      ? (delta > 0 ? 0 : matches.length - 1)
      : (current + delta + matches.length) % matches.length;
    setCurrent(next);
    revealAt(matches, next);
  };

  const handleReplaceCurrent = () => {
    if (current < 0 || !matches[current]) return;
    const m = matches[current];
    const v = form.getValues(m.path as any);
    if (typeof v !== 'string') return;
    form.setValue(m.path as any, replaceNth(v, m.isHtml, query, replacement, { caseSensitive }, m.occurrence), { shouldDirty: true });
    // The list shrank by one; keep the same index so we land on the following match.
    const list = refreshMatches(false);
    if (list.length === 0) { setCurrent(-1); return; }
    const next = Math.min(current, list.length - 1);
    setCurrent(next);
    revealAt(list, next);
  };

  const handleReplaceAll = () => {
    if (!query) return;
    const n = replaceAllInForm(
      form.getValues(), query, replacement, { caseSensitive }, groupsFilter,
      (path, val) => form.setValue(path as any, val, { shouldDirty: true }),
    );
    toast({
      title: n > 0 ? `Replaced ${n} occurrence${n === 1 ? '' : 's'}` : "No matches",
      description: n > 0 ? `“${query}” → “${replacement}”` : `“${query}” not found in scope.`,
    });
    refreshMatches(true);
  };

  const scopeLabel = selectedGroups.size === 0 ? "All sections" : `${selectedGroups.size} selected`;
  const total = matches.length;
  const position = total === 0
    ? (query ? "No matches" : "")
    : (current >= 0 ? `${current + 1} of ${total}` : `${total} found`);

  return (
    <div className="fixed top-16 right-4 z-50 w-80 rounded-lg border bg-popover text-popover-foreground shadow-xl p-3 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5" /> Find &amp; Replace
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span aria-label="Find limitations" className="inline-flex cursor-help">
                  <Info className="h-3 w-3 text-muted-foreground" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[260px] whitespace-pre-line text-xs font-normal leading-relaxed">
                {EDGE_CASE_TOOLTIP}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </span>
        <button type="button" onClick={() => setOpen(false)} className="p-0.5 rounded hover:bg-muted" title="Close (Esc)">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Find + navigation */}
      <div className="flex items-center gap-1.5">
        <input
          ref={findInputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); goTo(e.shiftKey ? -1 : 1); }
          }}
          placeholder="Find"
          className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button type="button" onClick={() => goTo(-1)} disabled={total === 0} title="Previous (Shift+Enter)"
          className="h-7 w-7 grid place-items-center rounded-md border border-input hover:bg-muted disabled:opacity-40">
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => goTo(1)} disabled={total === 0} title="Next (Enter)"
          className="h-7 w-7 grid place-items-center rounded-md border border-input hover:bg-muted disabled:opacity-40">
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="text-right text-[11px] tabular-nums text-muted-foreground h-3 -mt-1">{position}</div>

      {/* Replace */}
      <input
        value={replacement}
        onChange={e => setReplacement(e.target.value)}
        placeholder="Replace with"
        className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {/* Options */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 cursor-pointer text-muted-foreground">
          <input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)} className="h-3 w-3" />
          Match case
        </label>

        <div className="relative ml-auto" ref={scopeRef}>
          <button type="button" onClick={() => setShowScope(s => !s)}
            className="flex items-center gap-1 h-7 px-2 rounded-md border border-input bg-background hover:bg-muted"
            title="Choose which sections to search">
            {scopeLabel} <ChevronDown className="h-3 w-3" />
          </button>
          {showScope && (
            <div className="absolute top-full right-0 mt-1 z-50 w-44 rounded-md border bg-popover shadow-md py-1">
              <button type="button" onClick={() => setSelectedGroups(new Set())}
                className="flex items-center gap-2 w-full px-2 py-1 hover:bg-muted text-left">
                <span className="w-3">{selectedGroups.size === 0 && <Check className="h-3 w-3" />}</span>
                All sections
              </button>
              <div className="border-t my-1" />
              {SEARCH_GROUPS.map(g => (
                <button key={g} type="button" onClick={() => toggleGroup(g)}
                  className="flex items-center gap-2 w-full px-2 py-1 hover:bg-muted text-left">
                  <span className="w-3">{selectedGroups.has(g) && <Check className="h-3 w-3" />}</span>
                  {g}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={handleReplaceCurrent} disabled={current < 0}
          className="h-7 px-3 rounded-md border border-input text-xs hover:bg-muted disabled:opacity-40">
          Replace
        </button>
        <button type="button" onClick={handleReplaceAll} disabled={!query}
          className="h-7 px-3 rounded-md bg-primary text-primary-foreground text-xs hover:opacity-90 disabled:opacity-40">
          Replace All
        </button>
      </div>
    </div>
  );
}
