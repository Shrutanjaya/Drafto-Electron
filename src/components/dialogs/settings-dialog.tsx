import React, { useState, useEffect } from "react";
import { Settings, FolderOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";

type FontSize = 'small' | 'medium' | 'large';

interface SettingsData {
  defaultDocxPath: string;
  defaultPdfPath: string;
  fontSize: FontSize;
  annexureLabelBackground: boolean;
  autosaveInterval: number;
  toastDuration: number;
}

const SETTINGS_KEY = "drafto-settings";

export function SettingsDialog({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsData>({
    defaultDocxPath: "",
    defaultPdfPath: "",
    fontSize: 'small',
    annexureLabelBackground: false,
    autosaveInterval: 60,
    toastDuration: 1,
  });

  // Load settings from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings({
          defaultDocxPath: parsed.defaultDocxPath || "",
          defaultPdfPath: parsed.defaultPdfPath || "",
          fontSize: parsed.fontSize || 'small',
          annexureLabelBackground: parsed.annexureLabelBackground ?? false,
          autosaveInterval: parsed.autosaveInterval ?? 60,
          toastDuration: parsed.toastDuration ?? 1,
        });
        // Apply font size on load
        if (parsed.fontSize) {
          applyFontSize(parsed.fontSize);
        }
      } catch (err) {
        console.error("Failed to parse settings:", err);
      }
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    
    // Apply font size to HTML element
    applyFontSize(settings.fontSize);
    
    toast({
      title: "Settings Saved",
      description: "Your settings have been updated.",
    });
    setOpen(false);
  };

  const handleBrowse = async (type: "docx" | "pdf") => {
    console.log("Browse clicked for:", type);
    console.log("window.electron available:", !!window.electron);
    console.log("selectDirectory available:", !!window.electron?.selectDirectory);
    
    if (window.electron?.selectDirectory) {
      try {
        const path = await window.electron.selectDirectory();
        console.log("Selected path:", path);
        if (path) {
          setSettings((prev) => ({
            ...prev,
            [`default${type.charAt(0).toUpperCase() + type.slice(1)}Path`]: path,
          }));
        }
      } catch (err) {
        console.error("Failed to select directory:", err);
        toast({
          variant: "destructive",
          title: "Error",
          description: `Could not select directory: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else {
      console.log("Electron not available. window.electron:", window.electron);
      toast({
        variant: "destructive",
        title: "Not Available",
        description: "Directory selection is only available in the desktop app. Please restart the Electron app if you just updated it.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="docx-path" className="text-xs">Default .docx Location</Label>
            <div className="flex gap-2">
              <Input
                id="docx-path"
                value={settings.defaultDocxPath}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, defaultDocxPath: e.target.value }))
                }
                placeholder="C:\...\DOCX"
                className="h-8 text-xs"
              />
              <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => handleBrowse("docx")} title="Browse">
                <FolderOpen className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="pdf-path" className="text-xs">Default .pdf Location</Label>
            <div className="flex gap-2">
              <Input
                id="pdf-path"
                value={settings.defaultPdfPath}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, defaultPdfPath: e.target.value }))
                }
                placeholder="C:\...\PDF"
                className="h-8 text-xs"
              />
              <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => handleBrowse("pdf")} title="Browse">
                <FolderOpen className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-1">
            {/* Text Size */}
            <div className="space-y-1">
              <Label className="text-xs">Text Size</Label>
              <RadioGroup
                value={settings.fontSize}
                onValueChange={(value: FontSize) =>
                  setSettings((prev) => ({ ...prev, fontSize: value }))
                }
                className="flex gap-3"
              >
                {(['small', 'medium', 'large'] as FontSize[]).map((s) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <RadioGroupItem value={s} id={`size-${s}`} />
                    <Label htmlFor={`size-${s}`} className="text-xs font-normal cursor-pointer capitalize">{s}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Annexure Labels */}
            <div className="space-y-1">
              <Label className="text-xs">PDF Annexure Labels</Label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="annexure-bg"
                  checked={settings.annexureLabelBackground}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, annexureLabelBackground: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="annexure-bg" className="text-xs font-normal cursor-pointer">
                  White background behind labels
                </Label>
              </div>
            </div>

            {/* Autosave */}
            <div className="space-y-1">
              <Label htmlFor="autosave-interval" className="text-xs">Autosave Interval (seconds)</Label>
              <Input
                id="autosave-interval"
                type="number"
                min={0}
                step={10}
                value={settings.autosaveInterval}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, autosaveInterval: Math.max(0, parseInt(e.target.value) || 0) }))
                }
                placeholder="60"
                className="h-8 w-28 text-xs"
              />
              <p className="text-xs text-muted-foreground">0 = disabled</p>
            </div>

            {/* Notification duration */}
            <div className="space-y-1">
              <Label htmlFor="toast-duration" className="text-xs">Notification Duration (seconds)</Label>
              <Input
                id="toast-duration"
                type="number"
                min={1}
                step={1}
                value={settings.toastDuration}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, toastDuration: Math.max(1, parseInt(e.target.value) || 1) }))
                }
                placeholder="1"
                className="h-8 w-28 text-xs"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Settings</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper function to apply font size to HTML element
function applyFontSize(fontSize: FontSize) {
  if (typeof document === "undefined") return;
  
  const html = document.documentElement;
  // Remove existing size classes
  html.classList.remove('text-size-small', 'text-size-medium', 'text-size-large');
  // Add new size class
  html.classList.add(`text-size-${fontSize}`);
}

// Helper function to get settings
export function getSettings(): SettingsData {
  if (typeof window === "undefined") {
    return {
      defaultDocxPath: "",
      defaultPdfPath: "",
      fontSize: 'small',
      annexureLabelBackground: false,
      autosaveInterval: 60,
      toastDuration: 1,
    };
  }

  const stored = localStorage.getItem(SETTINGS_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return {
        defaultDocxPath: parsed.defaultDocxPath || "",
        defaultPdfPath: parsed.defaultPdfPath || "",
        fontSize: parsed.fontSize || 'small',
        annexureLabelBackground: parsed.annexureLabelBackground ?? false,
        autosaveInterval: parsed.autosaveInterval ?? 60,
        toastDuration: parsed.toastDuration ?? 1,
      };
    } catch (err) {
      console.error("Failed to parse settings:", err);
    }
  }

  return {
    defaultDocxPath: "",
    defaultPdfPath: "",
    fontSize: 'small',
    annexureLabelBackground: false,
    autosaveInterval: 60,
    toastDuration: 1,
  };
}

// Initialize font size on app load
if (typeof window !== "undefined") {
  const settings = getSettings();
  applyFontSize(settings.fontSize);
}
