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
import { getGenerationCounts, type UsageCounts } from "@/lib/firebase/usage-service";
import { LICENSE_TEXT, TERMS_TEXT } from "@/lib/legal";

type FontSize = 'small' | 'medium' | 'large';
type SlpTabView = 'splitter' | 'navigation';

interface SettingsData {
  defaultDocxPath: string;
  defaultPdfPath: string;
  fontSize: FontSize;
  annexureLabelBackground: boolean;
  autosaveInterval: number;
  toastDuration: number;
  slpTabView: SlpTabView;
}

const SETTINGS_KEY = "drafto-settings";

export function SettingsDialog({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [usageCounts, setUsageCounts] = useState<UsageCounts | null>(null);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsData>({
    defaultDocxPath: "",
    defaultPdfPath: "",
    fontSize: 'small',
    annexureLabelBackground: false,
    autosaveInterval: 60,
    toastDuration: 1,
    slpTabView: 'splitter',
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
          slpTabView: (parsed.slpTabView || 'splitter') as SlpTabView,
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

  // Fetch usage counts when dialog opens
  useEffect(() => {
    if (open) {
      getGenerationCounts().then(setUsageCounts);
    }
  }, [open]);

  const handleSave = () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('drafto-settings-changed'));
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
        const selectedPath = await window.electron.selectDirectory();
        if (selectedPath) {
          setSettings((prev) => ({
            ...prev,
            [`default${type.charAt(0).toUpperCase() + type.slice(1)}Path`]: selectedPath,
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
      <DialogContent className="max-w-lg flex flex-col max-h-[calc(100vh-4rem)]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 space-y-3 pr-1 -mr-1">

          {/* Your Usage */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground shrink-0">Your Usage:</span>
            <span className="text-xs tabular-nums font-semibold">{usageCounts === null ? "…" : usageCounts.paperbooksGenerated}</span>
            <span className="text-xs text-muted-foreground">Paperbooks,</span>
            <span className="text-xs tabular-nums font-semibold">{usageCounts === null ? "…" : usageCounts.docxGenerated}</span>
            <span className="text-xs text-muted-foreground">Docx Files</span>
          </div>

          {/* Output Locations */}
          <div className="border-t pt-2.5">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Output Locations:</p>
            <div className="flex items-center gap-2">
              <Label htmlFor="docx-path" className="text-xs shrink-0 w-7">Docx</Label>
              <Input
                id="docx-path"
                value={settings.defaultDocxPath}
                onChange={(e) => setSettings((prev) => ({ ...prev, defaultDocxPath: e.target.value }))}
                placeholder="C:\...\DOCX"
                className="h-7 text-xs flex-1"
              />
              <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleBrowse("docx")} title="Browse">
                <FolderOpen className="h-3 w-3" />
              </Button>
              <div className="border-l h-5 mx-0.5" />
              <Label htmlFor="pdf-path" className="text-xs shrink-0 w-6">PDF</Label>
              <Input
                id="pdf-path"
                value={settings.defaultPdfPath}
                onChange={(e) => setSettings((prev) => ({ ...prev, defaultPdfPath: e.target.value }))}
                placeholder="C:\...\PDF"
                className="h-7 text-xs flex-1"
              />
              <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleBrowse("pdf")} title="Browse">
                <FolderOpen className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Durations */}
          <div className="border-t pt-2.5">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Durations (seconds):</p>
            <div className="flex items-center gap-3">
              <Label htmlFor="toast-duration" className="text-xs shrink-0">Notifications</Label>
              <Input
                id="toast-duration"
                type="number"
                min={1}
                step={1}
                value={settings.toastDuration}
                onChange={(e) => setSettings((prev) => ({ ...prev, toastDuration: Math.max(1, parseInt(e.target.value) || 1) }))}
                className="h-7 w-14 text-xs text-right"
              />
              <div className="border-l h-5" />
              <Label htmlFor="autosave-interval" className="text-xs shrink-0">Autosave Interval (enter 0 to disable)</Label>
              <Input
                id="autosave-interval"
                type="number"
                min={0}
                step={10}
                value={settings.autosaveInterval}
                onChange={(e) => setSettings((prev) => ({ ...prev, autosaveInterval: Math.max(0, parseInt(e.target.value) || 0) }))}
                className="h-7 w-14 text-xs text-right"
              />
            </div>
          </div>

          {/* Text Size */}
          <div className="border-t pt-2.5 flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground shrink-0">Text Size:</span>
            <RadioGroup
              value={settings.fontSize}
              onValueChange={(value: FontSize) => setSettings((prev) => ({ ...prev, fontSize: value }))}
              className="flex gap-3"
            >
              {(['small', 'medium', 'large'] as FontSize[]).map((s) => (
                <div key={s} className="flex items-center gap-1">
                  <RadioGroupItem value={s} id={`size-${s}`} />
                  <Label htmlFor={`size-${s}`} className="text-xs font-normal cursor-pointer capitalize">{s}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Petition View */}
          <div className="border-t pt-2.5 flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground shrink-0">Petition View:</span>
            <RadioGroup
              value={settings.slpTabView}
              onValueChange={(value: SlpTabView) => setSettings((prev) => ({ ...prev, slpTabView: value }))}
              className="flex gap-3"
            >
              <div className="flex items-center gap-1">
                <RadioGroupItem value="splitter" id="slp-view-splitter" />
                <Label htmlFor="slp-view-splitter" className="text-xs font-normal cursor-pointer">Splitter View</Label>
              </div>
              <div className="flex items-center gap-1">
                <RadioGroupItem value="navigation" id="slp-view-navigation" />
                <Label htmlFor="slp-view-navigation" className="text-xs font-normal cursor-pointer">Navigation View</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Annexure Labels */}
          <div className="border-t pt-2.5 flex items-center gap-2">
            <input
              type="checkbox"
              id="annexure-bg"
              checked={settings.annexureLabelBackground}
              onChange={(e) => setSettings((prev) => ({ ...prev, annexureLabelBackground: e.target.checked }))}
              className="h-3.5 w-3.5 rounded border-gray-300 shrink-0"
            />
            <Label htmlFor="annexure-bg" className="text-xs font-normal cursor-pointer text-muted-foreground">
              Add white background behind Annexure Labels
            </Label>
          </div>

          {/* Legal */}
          <div className="border-t pt-2.5 flex items-center gap-2 pb-0.5">
            <span className="text-xs font-medium text-muted-foreground shrink-0">Legal:</span>
            <button
              type="button"
              onClick={() => setLicenseOpen(true)}
              className="text-xs text-primary underline underline-offset-2 hover:opacity-80"
            >
              Software License Agreement
            </button>
            <span className="text-xs text-muted-foreground">|</span>
            <button
              type="button"
              onClick={() => setTermsOpen(true)}
              className="text-xs text-primary underline underline-offset-2 hover:opacity-80"
            >
              Terms &amp; Conditions
            </button>
          </div>

        </div>{/* end scrollable body */}

        {/* Legal document popups */}
        <Dialog open={licenseOpen} onOpenChange={setLicenseOpen}>
          <DialogContent className="max-w-2xl flex flex-col max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Software License Agreement</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto flex-1 text-[10px] leading-relaxed whitespace-pre-wrap font-mono text-muted-foreground border rounded p-3">
              {LICENSE_TEXT}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
          <DialogContent className="max-w-2xl flex flex-col max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Terms &amp; Conditions</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto flex-1 text-[10px] leading-relaxed whitespace-pre-wrap font-mono text-muted-foreground border rounded p-3">
              {TERMS_TEXT}
            </div>
          </DialogContent>
        </Dialog>

        {/* Sticky footer — always visible */}
        <div className="shrink-0 flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
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
      slpTabView: 'splitter' as SlpTabView,
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
        slpTabView: (parsed.slpTabView || 'splitter') as SlpTabView,
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
    slpTabView: 'splitter' as SlpTabView,
  };
}

// Initialize font size on app load
if (typeof window !== "undefined") {
  const settings = getSettings();
  applyFontSize(settings.fontSize);
}
