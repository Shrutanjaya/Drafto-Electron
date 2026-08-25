
import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { FileText, FolderOpen, Search, Clock, ArrowDownAZ, Trash2, FolderSearch, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface DraftoFileInfo {
  name: string;
  fileName: string;
  path: string;
  modifiedDate: string;
  size: number;
  parties?: string;
  caseNumber?: string;
}

interface LoadProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoadFromPath: (filePath: string) => void;
}

type SortBy = 'date' | 'name';

/** Show last N path segments, e.g. "…\Projects\Jacob Mathew.drafto" */
const shortenPath = (fullPath: string) => {
  const parts = fullPath.split(/[\\/]/);
  if (parts.length <= 3) return fullPath;
  return '…' + (fullPath.includes('/') ? '/' : '\\') + parts.slice(-3).join(fullPath.includes('/') ? '/' : '\\');
};

const dirOf = (fullPath: string) => fullPath.replace(/[\\/][^\\/]+$/, '');

const fmtSize = (b: number) =>
  b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`;

/** Today / This week / Earlier bucket for date-sorted grouping. */
const timeBucket = (dateStr: string): string => {
  const t = new Date(dateStr).getTime();
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (t >= startToday) return 'Today';
  if (t >= startToday - 6 * 86400000) return 'This week';
  return 'Earlier';
};

/** Highlight the search match within a label. */
function highlightMatch(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-yellow-200 dark:bg-yellow-700/60 text-foreground rounded-[2px] px-0.5">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function LoadProjectDialog({ open, onOpenChange, onLoadFromPath }: LoadProjectDialogProps) {
  const [files, setFiles] = useState<DraftoFileInfo[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setSearch('');
      setActiveIndex(0);
      setConfirmingDelete(null);
      loadFiles();
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  const loadFiles = async () => {
    if (!window.electron?.getRecentFiles) return;
    setIsLoading(true);
    try {
      setFiles(await window.electron.getRecentFiles());
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to load recent projects." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBrowse = async () => {
    if (!window.electron?.openDraftoFileDialog) return;
    const filePath = await window.electron.openDraftoFileDialog();
    if (filePath) {
      onLoadFromPath(filePath);
      onOpenChange(false);
    }
  };

  const openFile = (file: DraftoFileInfo) => {
    onLoadFromPath(file.path);
    onOpenChange(false);
  };

  const revealFile = (file: DraftoFileInfo) => {
    window.electron?.revealFilePath?.(file.path);
  };

  const deleteFile = async (file: DraftoFileInfo) => {
    setConfirmingDelete(null);
    const r = await window.electron?.deleteDraftoFile?.(file.path);
    if (r?.ok) {
      toast({ title: "Deleted", description: `${file.name} was deleted.` });
      loadFiles();
    } else {
      toast({ variant: "destructive", title: "Couldn't delete", description: r?.error || "Try again." });
    }
  };

  const visible = [...files]
    .filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sortBy === 'date'
        ? new Date(b.modifiedDate).getTime() - new Date(a.modifiedDate).getTime()
        : a.name.localeCompare(b.name)
    );

  // Keep the active row in range and scrolled into view.
  useEffect(() => {
    if (activeIndex >= visible.length) setActiveIndex(Math.max(0, visible.length - 1));
  }, [visible.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, visible.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (visible[activeIndex]) openFile(visible[activeIndex]); }
  };

  // Date-sorted → grouped under Today / This week / Earlier; name-sorted → flat.
  const groups: { label: string | null; items: DraftoFileInfo[] }[] =
    sortBy === 'date'
      ? (() => {
          const order = ['Today', 'This week', 'Earlier'];
          const map: Record<string, DraftoFileInfo[]> = {};
          visible.forEach(f => { (map[timeBucket(f.modifiedDate)] ||= []).push(f); });
          return order.filter(o => map[o]?.length).map(o => ({ label: o, items: map[o] }));
        })()
      : [{ label: null, items: visible }];

  let flatIdx = -1; // running index across groups, matches `visible` order

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0] as (File & { path?: string }) | undefined;
    const p = f?.path;
    if (p && (p.toLowerCase().endsWith('.drafto') || p.toLowerCase().endsWith('.dhcwp'))) {
      onLoadFromPath(p);
      onOpenChange(false);
    } else if (f) {
      toast({ variant: "destructive", title: "Not a Drafto file", description: "Drop a .drafto or .dhcwp project file." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl flex flex-col p-0 gap-0 overflow-hidden"
        style={{ height: 'min(580px, calc(100vh - 4rem))' }}
        onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
        onDrop={handleDrop}
      >

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0 border-b">
          <DialogTitle className="text-base font-semibold">Load Project</DialogTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBrowse}
            disabled={!window.electron?.openDraftoFileDialog}
            className="h-8 text-xs"
          >
            <FolderOpen className="mr-1.5 h-3.5 w-3.5" /> Browse…
          </Button>
        </div>

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-2 px-4 py-2.5 shrink-0 border-b bg-muted/30">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchRef}
              value={search}
              onChange={e => { setSearch(e.target.value); setActiveIndex(0); }}
              onKeyDown={onSearchKeyDown}
              placeholder="Search projects…  (↑↓ navigate, Enter to open)"
              className="pl-8 h-7 text-xs bg-background"
            />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setSortBy('date')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${sortBy === 'date' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
            >
              <Clock className="h-3 w-3" /> Recent
            </button>
            <button
              onClick={() => setSortBy('name')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${sortBy === 'name' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
            >
              <ArrowDownAZ className="h-3 w-3" /> A–Z
            </button>
          </div>
        </div>

        {/* ── List ── */}
        <div ref={listRef} className="flex-1 overflow-y-auto min-h-0 relative">
          {dragOver && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary/50 m-2 rounded-lg pointer-events-none">
              <p className="text-sm font-medium text-primary">Drop a .drafto file to open</p>
            </div>
          )}
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading…</div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-3">
              <div className="rounded-full bg-muted p-4">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">{search ? 'No matching projects' : 'No recent projects'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {search ? 'Try a different search term.' : 'Save a project with Ctrl+S and it will appear here.'}
                </p>
              </div>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label ?? 'all'}>
                {group.label && (
                  <p className="sticky top-0 z-[1] bg-background/95 backdrop-blur px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b">
                    {group.label}
                  </p>
                )}
                <ul className="divide-y">
                  {group.items.map((file) => {
                    flatIdx += 1;
                    const idx = flatIdx;
                    const isActive = idx === activeIndex;
                    const subtitle = (file.parties || file.caseNumber)
                      ? [file.parties, file.caseNumber].filter(Boolean).join(' · ')
                      : shortenPath(file.path);
                    return (
                      <li
                        key={file.path}
                        data-idx={idx}
                        className={cn(
                          "group flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                          isActive ? "bg-muted" : "hover:bg-muted/60"
                        )}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => openFile(file)}
                      >
                        <div className="shrink-0 rounded-md bg-primary/10 p-2 group-hover:bg-primary/20 transition-colors">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{highlightMatch(file.name, search)}</p>
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5" title={file.path}>
                            {subtitle}
                          </p>
                        </div>

                        {/* Hover actions */}
                        {confirmingDelete === file.path ? (
                          <div className="shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[11px] text-muted-foreground">Delete?</span>
                            <button type="button" title="Confirm delete" onClick={() => deleteFile(file)} className="p-1 rounded text-destructive hover:bg-destructive/10">
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" title="Cancel" onClick={() => setConfirmingDelete(null)} className="p-1 rounded text-muted-foreground hover:bg-muted">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                            <button type="button" title="Reveal in folder" onClick={() => revealFile(file)} className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground">
                              <FolderSearch className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" title="Delete project" onClick={() => setConfirmingDelete(file.path)} className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}

                        <div className="shrink-0 text-right w-[92px]">
                          <p className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(file.modifiedDate), "MMM d, yyyy")}
                          </p>
                          <p className="text-[11px] text-muted-foreground/70 whitespace-nowrap mt-0.5">
                            {format(new Date(file.modifiedDate), "h:mm a")} · {fmtSize(file.size)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

      </DialogContent>
    </Dialog>
  );
}
