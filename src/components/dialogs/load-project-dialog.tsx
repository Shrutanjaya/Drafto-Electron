
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { FileText, ArrowUpDown, FolderOpen } from "lucide-react";
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
  onLoad: (content: string) => void;
}

export function LoadProjectDialog({ open, onOpenChange, onLoad }: LoadProjectDialogProps) {
  const [files, setFiles] = useState<DraftoFileInfo[]>([]);
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Load files when dialog opens
  useEffect(() => {
    if (open) {
      loadFiles();
    }
  }, [open]);

  const loadFiles = async () => {
    if (!window.electron?.listDraftoFiles) {
      toast({
        variant: "destructive",
        title: "Not Available",
        description: "This feature is only available in the desktop app.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const fileList = await window.electron.listDraftoFiles();
      setFiles(fileList);
    } catch (error) {
      console.error("Error loading files:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load project files.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadFile = async (fileName: string) => {
    if (!window.electron?.loadDraftoFile) return;

    setIsLoading(true);
    try {
      const content = await window.electron.loadDraftoFile(fileName);
      onLoad(content);
      onOpenChange(false);
      toast({
        title: "Project Loaded",
        description: `Successfully loaded ${fileName.replace('.drafto', '')}`,
      });
    } catch (error) {
      console.error("Error loading file:", error);
      toast({
        variant: "destructive",
        title: "Load Failed",
        description: "Could not load the selected project.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenProjectsFolder = () => {
    if (window.electron?.openProjectsFolder) {
      window.electron.openProjectsFolder();
    }
  };

  // Sort files
  const sortedFiles = [...files].sort((a, b) => {
    if (sortBy === 'date') {
      return new Date(b.modifiedDate).getTime() - new Date(a.modifiedDate).getTime();
    } else {
      return a.name.localeCompare(b.name);
    }
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Load Project</DialogTitle>
          <DialogDescription>
            Select a project to load from your saved projects
          </DialogDescription>
        </DialogHeader>

        {/* Sort Controls */}
        <div className="flex gap-2 items-center">
          <div className="flex gap-2">
            <Button
              variant={sortBy === 'date' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSortBy('date')}
            >
              <ArrowUpDown className="mr-2 h-4 w-4" />
              Recent First
            </Button>
            <Button
              variant={sortBy === 'name' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSortBy('name')}
            >
              <ArrowUpDown className="mr-2 h-4 w-4" />
              A-Z
            </Button>
          </div>
          
          {window.electron?.openProjectsFolder && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenProjectsFolder}
              className="ml-auto"
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              Open Projects Folder
            </Button>
          )}
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto border rounded-md">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Loading projects...
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No projects found</p>
              <p className="text-sm text-muted-foreground mt-2">
                Save your current work with Ctrl+S to create a project
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project Name</TableHead>
                  <TableHead>Last Modified</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedFiles.map((file) => (
                  <TableRow
                    key={file.fileName}
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => handleLoadFile(file.fileName)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {file.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(file.modifiedDate), "MMM dd, yyyy 'at' h:mm a")}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatFileSize(file.size)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
