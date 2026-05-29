
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { FileText, FolderOpen, ExternalLink, Search, Clock, ArrowDownAZ } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DraftoFileInfo {
  name: string;
  fileName: string;
  path: string;
  modifiedDate: string;
  size: number;
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

export function LoadProjectDialog({ open, onOpenChange, onLoadFromPath }: LoadProjectDialogProps) {
  const [files, setFiles] = useState<DraftoFileInfo[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setSearch('');
      loadFiles();
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

  const visible = [...files]
    .filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sortBy === 'date'
        ? new Date(b.modifiedDate).getTime() - new Date(a.modifiedDate).getTime()
        : a.name.localeCompare(b.name)
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl flex flex-col p-0 gap-0 overflow-hidden" style={{ height: 'min(580px, calc(100vh - 4rem))' }}>

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
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search projects…"
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
        <div className="flex-1 overflow-y-auto min-h-0">
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
            <ul className="divide-y">
              {visible.map((file) => (
                <li
                  key={file.path}
                  className="group flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/60 transition-colors"
                  onClick={() => { onLoadFromPath(file.path); onOpenChange(false); }}
                >
                  <div className="shrink-0 rounded-md bg-primary/10 p-2 group-hover:bg-primary/20 transition-colors">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5" title={file.path}>
                      {shortenPath(file.path)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(file.modifiedDate), "MMM d, yyyy")}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 whitespace-nowrap mt-0.5">
                      {format(new Date(file.modifiedDate), "h:mm a")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-4 py-2.5 border-t shrink-0 bg-muted/30">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => window.electron?.openProjectsFolder?.()}
          >
            <ExternalLink className="h-3 w-3" /> Open local projects folder
          </button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
