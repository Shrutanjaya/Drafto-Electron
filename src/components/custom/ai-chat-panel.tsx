"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useFormContext } from "react-hook-form";
import { Sparkles, X, Minus, FolderOpen, Send, Loader2, AlertCircle, CheckCircle, Wand2, Maximize2, Minimize2 } from "lucide-react";
import { PRESETS } from "@/lib/ai/presets";
import { estimateLabel, formatElapsed, type Effort } from "@/lib/ai/estimate";
import { getSettings } from "@/components/dialogs/settings-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildSystemPrompt } from "@/lib/ai/drafto-knowledge";
import { validateProposal, extractProposal, extractPartialProposal, stripJsonBlock, buildPreview, type SafeOp, type ChangePreview } from "@/lib/ai/form-patch";
import { applyOps } from "@/lib/ai/apply-ops";
import { validateDocumentMap, type SafeDocument } from "@/lib/ai/document-map";
import { renderThumbnails } from "@/lib/ai/pdf-thumb";
import { applyDocuments, type AttachableDoc } from "@/lib/ai/apply-documents";
import { useToast } from "@/hooks/use-toast";

type ChatRole = "user" | "assistant" | "system";
interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

interface PendingSuggestion {
  ops: SafeOp[];
  preview: ChangePreview[];
  rejected: { path: string; reason: string }[];
}

interface DocReviewItem {
  id: string;
  doc: SafeDocument;
}
interface PendingDocMap {
  items: DocReviewItem[];
  rejected: { label: string; reason: string }[];
  thumbs: Record<string, string>;
}

// "12,340" → "~12k", "850" → "~850"
function fmtTokens(n: number): string {
  if (n >= 1000) return `~${Math.round(n / 1000)}k`;
  return `~${n}`;
}

// Below this many text tokens, a folder task runs without a cost prompt.
const TOKEN_WARN_THRESHOLD = 20000;

// Heuristic: did the user's message ask Mayur to put content INTO Drafto? Used
// only for the safety-net "Put this into Drafto" button (the system prompt is
// the real driver). Catches action verbs and affirmations of an offer to fill.
const ACTION_RE = /\b(draft|fill|writ|enter|populat|prepare|complete|attach|generat|put\s+in)\b/i;
const AFFIRM_RE = /^\s*(yes|yep|yup|ok|okay|sure|go ahead|do it|please do|fill|enter)\b/i;
function isActionish(text: string): boolean {
  return ACTION_RE.test(text) || AFFIRM_RE.test(text);
}

const FILL_FROM_CHAT_PROMPT =
  "Now put the content from your previous message into the appropriate Drafto fields as a JSON proposal. Use exactly what you already wrote above — do not re-read the source documents. Make sure the JSON is strictly valid: escape every double-quote as \\\" and every line break as \\n inside string values, and wrap it in a ```json code block.";

// "1234" → "1.2k", "850" → "850"
function fmtNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

// Build a File object from a PDF on disk (so the annexure clip icon registers,
// the same way the upload dialog's File does). `.path` mimics an Electron File.
async function fileFromPath(filePath: string): Promise<File | undefined> {
  try {
    const f = await window.electron?.readFileByPath?.(filePath);
    if (!f?.data) return undefined;
    const bin = atob(f.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const name = f.name || filePath.split(/[\\/]/).pop() || "annexure.pdf";
    const file = new File([bytes], name, { type: "application/pdf" });
    (file as unknown as { path: string }).path = filePath;
    return file;
  } catch {
    return undefined;
  }
}

// Bottom-right AI assistant chat box (Beta). Drafto provides no AI of its own —
// this surface connects to the user's locally-installed Claude Code CLI. Layer 2
// builds the UI shell + prerequisite gating; the live CLI bridge and
// form auto-population arrive in later layers.
export function AiChatPanel() {
  // Mirror the persisted setting and react to Settings saves.
  const [enabled, setEnabled] = useState(false);
  const [claudePath, setClaudePath] = useState("");
  const [model, setModelState] = useState<string>("default");
  useEffect(() => {
    const sync = () => {
      const s = getSettings();
      setEnabled(s.aiPluginEnabled);
      setClaudePath(s.aiClaudeBinaryPath);
      setModelState(s.aiModel || "default");
    };
    sync();
    window.addEventListener("drafto-settings-changed", sync);
    return () => window.removeEventListener("drafto-settings-changed", sync);
  }, []);

  // Persist a model change from the header switcher (mirrors Settings).
  const changeModel = (m: string) => {
    setModelState(m);
    try {
      const stored = localStorage.getItem("drafto-settings");
      const existing = stored ? JSON.parse(stored) : {};
      localStorage.setItem("drafto-settings", JSON.stringify({ ...existing, aiModel: m }));
      window.dispatchEvent(new CustomEvent("drafto-settings-changed"));
    } catch { /* ignore */ }
  };

  const [open, setOpen] = useState(false);
  const [prereqOk, setPrereqOk] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [folder, setFolder] = useState<string>("");
  const [folderScan, setFolderScan] = useState<AiFolderScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [thinking, setThinking] = useState(false);
  // Live activity log: each distinct status becomes a step (done ✓ or current ⟳).
  const [steps, setSteps] = useState<{ id: string; label: string; done: boolean }[]>([]);
  const [usage, setUsage] = useState<{ input: number; output: number } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [, setTick] = useState(0); // forces the elapsed clock to re-render
  const [estimate, setEstimate] = useState<string>("");
  const [lastContextTokens, setLastContextTokens] = useState(0);
  // Remember the cost decision for this conversation so follow-ups don't re-ask.
  const [costAcknowledged, setCostAcknowledged] = useState(false);
  const [imageModePref, setImageModePref] = useState<"text" | "images">("text");
  // The most recent user turn, so it can be re-run (e.g. retried in image mode).
  const [lastTurn, setLastTurn] = useState<{ text: string; effort: Effort } | null>(null);
  const [pending, setPending] = useState<PendingSuggestion | null>(null);
  const [pendingDocMap, setPendingDocMap] = useState<PendingDocMap | null>(null);
  const [docSplitting, setDocSplitting] = useState(false);
  const [showPresets, setShowPresets] = useState(true);
  // Safety net: shown when an action request came back as prose with no proposal.
  const [showFillButton, setShowFillButton] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Claude Code session id, carried turn-to-turn so the conversation has memory.
  const [sessionId, setSessionId] = useState<string | null>(null);
  // When a folder has scanned pages, we ask the user before reading them as
  // images. The pending send is parked here until they choose.
  const [pendingConfirm, setPendingConfirm] = useState<{ text: string; effort: Effort } | null>(null);

  const form = useFormContext();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const addMessage = (role: ChatRole, text: string) =>
    setMessages((prev) => [...prev, { id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, role, text }]);

  const runPrereqCheck = useCallback(async () => {
    if (!window.electron?.aiCheckPrerequisites) {
      setPrereqOk(false);
      return;
    }
    setChecking(true);
    try {
      const result = await window.electron.aiCheckPrerequisites({ customClaudePath: claudePath });
      setPrereqOk(result.ok);
    } catch {
      setPrereqOk(false);
    } finally {
      setChecking(false);
    }
  }, [claudePath]);

  // Re-check prerequisites whenever the panel is opened.
  useEffect(() => {
    if (open) runPrereqCheck();
  }, [open, runPrereqCheck]);

  // Keep the transcript scrolled to the newest message.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, steps]);

  // Subscribe to live progress from the running CLI turn — each distinct status
  // becomes a step, with the previous step marked done.
  useEffect(() => {
    if (!window.electron?.onAiStream) return;
    const dispose = window.electron.onAiStream((msg) => {
      if (msg?.kind === "usage") {
        setUsage({ input: msg.input ?? 0, output: msg.output ?? 0 });
        return;
      }
      if (!msg?.text) return;
      const label = msg.text;
      setSteps((prev) => {
        if (prev.length && prev[prev.length - 1].label === label) return prev;
        const next = prev.map((s) => ({ ...s, done: true }));
        next.push({ id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, label, done: false });
        return next;
      });
    });
    return dispose;
  }, []);

  // Tick the elapsed clock once a second while a turn is running.
  useEffect(() => {
    if (!thinking) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [thinking]);

  if (!enabled) return null;

  // Best-effort context size for the time estimate (folder text, or the prior
  // turn's actual input once a conversation is underway).
  const estimateContext = Math.max(folderScan?.textTokens ?? 0, lastContextTokens);
  const presetEstimate = (effort: Effort) => estimateLabel(estimateContext, effort, model);

  const handleStop = () => {
    window.electron?.aiCancel?.();
  };

  const handlePickFolder = async () => {
    if (!window.electron?.selectDirectory) return;
    const dir = await window.electron.selectDirectory();
    if (!dir) return;
    setFolder(dir);
    setFolderScan(null);
    setPendingDocMap(null);
    setCostAcknowledged(false);
    setImageModePref("text");
    setLastTurn(null);
    setSessionId(null); // new source context → start a fresh conversation
    setShowPresets(true); // re-show the task menu for the new session
    if (!window.electron.aiScanFolder) return;
    setScanning(true);
    try {
      const scan = await window.electron.aiScanFolder(dir);
      if (scan.ok) setFolderScan(scan);
      else addMessage("system", scan.error || "Couldn't read PDFs in that folder.");
    } catch (err) {
      addMessage("system", err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  const clearFolder = () => {
    setFolder("");
    setFolderScan(null);
    setSessionId(null);
    setCostAcknowledged(false);
    setImageModePref("text");
    setLastTurn(null);
    setShowPresets(true); // re-show the task menu on reset
  };

  // Phase 1: validate + decide whether to show the cost confirmation first.
  const submitText = (raw: string, effort: Effort = "medium") => {
    const text = raw.trim();
    if (!text || thinking || scanning) return;
    // Warn before any substantial task: a folder with scanned pages (paid image
    // reading) OR a large amount of source text. Trivial tasks just run.
    const textTok = folderScan?.textTokens ?? 0;
    const scanned = folderScan?.scannedPageCount ?? 0;
    // Ask once per conversation; follow-ups reuse the remembered choice.
    if (folder && folderScan?.ok && !costAcknowledged && (scanned > 0 || textTok >= TOKEN_WARN_THRESHOLD)) {
      setPendingConfirm({ text, effort });
      return;
    }
    runTurn(text, imageModePref, effort);
  };
  const handleSend = () => submitText(input, "medium");
  const runPreset = (prompt: string, effort: Effort) => {
    setShowPresets(false);
    submitText(prompt, effort);
  };
  // Safety net: ask Mayur to convert its last chat reply into a field proposal,
  // reusing what it wrote (no folder re-read).
  const fillFromChat = () => {
    setShowFillButton(false);
    submitText(FILL_FROM_CHAT_PROMPT, "medium");
  };

  // Validate + present field-fill suggestions. Returns how many were accepted.
  const presentFieldOps = (proposal: { operations?: unknown[] }): number => {
    const { valid, rejected } = validateProposal(proposal);
    if (valid.length > 0) {
      setPending({ ops: valid, preview: buildPreview(form.getValues(), valid), rejected });
    } else if (rejected.length > 0) {
      addMessage("system", "The assistant proposed changes I couldn't apply (unknown or invalid fields). Nothing was changed.");
    }
    return valid.length;
  };

  // Validate + present a document-map review (with thumbnails). Returns count.
  const presentDocMap = (rawDocuments: unknown[]): number => {
    if (!folderScan?.ok || !folderScan.files) return 0;
    const files = folderScan.files.map((f) => ({ name: f.name, pageCount: f.pageCount }));
    const { valid: validDocs, rejected: rejectedDocs } = validateDocumentMap(rawDocuments, files);
    if (validDocs.length === 0) {
      if (rejectedDocs.length > 0) {
        addMessage("system", `I proposed ${rejectedDocs.length} document(s) I couldn't map (page ranges out of bounds or overlapping). Nothing was split.`);
      }
      return 0;
    }
    const items: DocReviewItem[] = validDocs.map((doc, i) => ({ id: `doc_${Date.now()}_${i}`, doc }));
    setPendingDocMap({ items, rejected: rejectedDocs, thumbs: {} });
    const reqs = items
      .map((it) => {
        const src = folderScan.files!.find((f) => f.name === it.doc.sourceFile);
        return src ? { id: it.id, sourcePath: src.originalPath, page: it.doc.startPage } : null;
      })
      .filter((r): r is { id: string; sourcePath: string; page: number } => r !== null);
    renderThumbnails(reqs).then((thumbs) => setPendingDocMap((prev) => (prev ? { ...prev, thumbs } : prev)));
    return validDocs.length;
  };

  // Phase 2: actually run the turn. mode controls scanned-page handling.
  const runTurn = async (text: string, mode: "text" | "images", effort: Effort = "medium") => {
    addMessage("user", text);
    setLastTurn({ text, effort });
    setInput("");
    setPending(null);
    setPendingDocMap(null);
    setShowFillButton(false);
    setSteps([{ id: "start", label: "Starting…", done: false }]);
    setUsage(null);
    setEstimate(estimateLabel(estimateContext, effort, model));
    setStartedAt(Date.now());
    setThinking(true);
    try {
      // Build the source note + the directories the CLI may read.
      let sourceNote: string | undefined;
      const addDirs: string[] = [];
      if (folderScan?.ok && folderScan.contextDir) {
        addDirs.push(folderScan.contextDir);
        sourceNote =
          `The user's source documents have been extracted to plain-text files in this folder:\n  ${folderScan.contextDir}\nRead those .txt files to get the document contents.`;
        // List the original PDFs + page counts so the model can build a
        // "documents" map referencing exact file names and page numbers.
        const fileList = (folderScan.files || [])
          .map((f) => `  - ${f.name} (${f.pageCount} page${f.pageCount === 1 ? "" : "s"})`)
          .join("\n");
        if (fileList) {
          sourceNote += `\n\nThe original source PDF files (use these exact names and 1-indexed page numbers in any "documents" map you produce) are:\n${fileList}`;
        }
        const scannedFiles = (folderScan.files || []).filter((f) => f.scannedPages.length > 0);
        if (mode === "images" && scannedFiles.length > 0) {
          addDirs.push(folder);
          const list = scannedFiles
            .map((f) => `  ${f.originalPath} (pages ${f.scannedPages.join(", ")})`)
            .join("\n");
          sourceNote += `\n\nSome pages are scanned images with no extractable text. Read these specific pages directly from the original PDFs (as images):\n${list}`;
        } else if (scannedFiles.length > 0) {
          sourceNote += `\n\nNote: some pages are scanned and were not extracted, so they are omitted. Work from the available text and say in your message if something important may be missing.`;
        }
      }

      const result = await window.electron!.aiRun({
        prompt: text,
        systemPrompt: buildSystemPrompt(sourceNote ? { sourceNote } : {}),
        addDirs: addDirs.length ? addDirs : undefined,
        resumeSessionId: sessionId || undefined,
        model: model && model !== "default" ? model : undefined,
        claudePath: claudePath || undefined,
      });

      // Carry the session forward so the next turn continues this conversation.
      if (result.sessionId) setSessionId(result.sessionId);
      // Replace the live estimate with the accurate final token usage.
      if (typeof result.inputTokens === "number" || typeof result.outputTokens === "number") {
        setUsage({ input: result.inputTokens || 0, output: result.outputTokens || 0 });
      }
      // Remember the actual context size to estimate the next turn better.
      if (result.inputTokens) setLastContextTokens(result.inputTokens);

      if (!result.ok) {
        if (result.needsLogin) {
          addMessage("system", "Claude Code isn't signed in. Open Settings → Mayur and click \"Sign in to Claude Code\" (or run `claude auth login` in a terminal), then try again.");
          return;
        }
        // Best-effort salvage: recover whatever fields/annexures fully completed
        // before the Stop or timeout, and present them for review.
        let salvaged = 0;
        if (result.partialText) {
          const partial = extractPartialProposal(result.partialText);
          if (partial) {
            salvaged += presentFieldOps(partial);
            if (partial.documents && partial.documents.length > 0) salvaged += presentDocMap(partial.documents);
          }
        }
        if (salvaged > 0) {
          addMessage("system", `${result.cancelled ? "Stopped" : "The run ended early"} — recovered ${salvaged} completed item${salvaged === 1 ? "" : "s"}. Review below and Apply what you want to keep.`);
        } else {
          addMessage("system", result.cancelled ? "Stopped. Nothing had finished yet, so nothing was recovered." : result.error || "Mayur couldn't complete the request.");
        }
        return;
      }

      const replyText = result.text || "";
      const proposal = extractProposal(replyText);
      // Reply that attempted a proposal but we couldn't parse it (e.g. invalid
      // JSON). Don't dump the raw JSON at the user — offer a clean retry.
      const looksLikeFailedJson = !proposal && /("operations"\s*:|"documents"\s*:|```json)/.test(replyText);
      const humanText = stripJsonBlock(replyText);

      // Show the assistant's prose (prefer its own summary message if present).
      const prose = proposal?.message || (looksLikeFailedJson ? "" : humanText);
      if (prose) addMessage("assistant", prose);
      else if (looksLikeFailedJson) addMessage("system", "I drafted this, but couldn't format it cleanly into Drafto's fields. Click \"Put this into Drafto\" and I'll re-enter it as valid data.");
      else if (!proposal) addMessage("assistant", replyText || "(no response)");

      let produced = 0;
      if (proposal) produced += presentFieldOps(proposal);
      // A "documents" map → split-and-attach review (annexures etc.).
      if (proposal?.documents) produced += presentDocMap(proposal.documents);
      // Safety net: an action request that came back as prose / un-parseable JSON.
      if (produced === 0 && (looksLikeFailedJson || (!!prose && isActionish(text)))) setShowFillButton(true);
    } catch (err) {
      addMessage("system", err instanceof Error ? err.message : String(err));
    } finally {
      setThinking(false);
      setSteps((prev) => prev.map((s) => ({ ...s, done: true })));
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const applySuggestions = () => {
    if (!pending) return;
    const applied = applyOps(form, pending.ops);
    setPending(null);
    addMessage("system", `Applied ${applied.length} change${applied.length === 1 ? "" : "s"}. Review the affected tabs and Save when you're happy.`);
    toast({ title: "Suggestions applied", description: `${applied.length} field${applied.length === 1 ? "" : "s"} updated. Nothing is saved until you save the project.` });
  };

  const dismissSuggestions = () => {
    setPending(null);
    addMessage("system", "Suggestions dismissed. Nothing was changed.");
  };

  const approveDocMap = async () => {
    if (!pendingDocMap || !folderScan?.files || docSplitting) return;
    setDocSplitting(true);
    try {
      const projectPath = (window as unknown as { __draftoProjectPath?: string | null }).__draftoProjectPath || null;
      const documents = pendingDocMap.items
        .map((it) => {
          const src = folderScan.files!.find((f) => f.name === it.doc.sourceFile);
          return src
            ? { id: it.id, sourcePath: src.originalPath, startPage: it.doc.startPage, endPage: it.doc.endPage, title: it.doc.title || it.doc.type }
            : null;
        })
        .filter((d): d is { id: string; sourcePath: string; startPage: number; endPage: number; title: string } => d !== null);

      const res = await window.electron!.aiSplitDocuments({ projectPath, documents });
      if (!res.ok) {
        addMessage("system", res.error || "Splitting the documents failed.");
        return;
      }
      const attachable: AttachableDoc[] = await Promise.all(
        (res.results || [])
          .filter((r) => r.ok && r.filePath)
          .map(async (r) => {
            const item = pendingDocMap.items.find((it) => it.id === r.id)!;
            const file = await fileFromPath(r.filePath!);
            return { doc: item.doc, filePath: r.filePath!, file };
          })
      );
      const summary = applyDocuments(form, attachable);
      const failed = (res.results || []).filter((r) => !r.ok).length;
      setPendingDocMap(null);

      const parts: string[] = [
        `Split & attached ${summary.annexuresAttached} annexure${summary.annexuresAttached === 1 ? "" : "s"}`,
      ];
      if (summary.rowsCreated > 0) parts.push(`created ${summary.rowsCreated} new List-of-Dates row${summary.rowsCreated === 1 ? "" : "s"}`);
      if (summary.deferred.length > 0) parts.push(`detected ${summary.deferred.length} other document${summary.deferred.length === 1 ? "" : "s"} (${summary.deferred.map((d) => d.type.replace("_", " ")).join(", ")}) — not auto-attached yet`);
      if (failed > 0) parts.push(`${failed} failed to split`);
      const where = res.managed
        ? "Files saved in the annexures folder next to your project."
        : "Files saved to a temporary folder — save your project to keep them alongside it.";
      addMessage("system", `${parts.join("; ")}. ${where} Review the annexures, then Save.`);
      toast({ title: "Documents attached", description: `${summary.annexuresAttached} annexure${summary.annexuresAttached === 1 ? "" : "s"} split and attached.` });
    } catch (err) {
      addMessage("system", err instanceof Error ? err.message : String(err));
    } finally {
      setDocSplitting(false);
    }
  };

  const dismissDocMap = () => {
    setPendingDocMap(null);
    addMessage("system", "Document split dismissed. Nothing was changed.");
  };

  const confirmImages = () => {
    const t = pendingConfirm?.text;
    const e = pendingConfirm?.effort ?? "medium";
    setPendingConfirm(null);
    setCostAcknowledged(true);
    setImageModePref("images");
    if (t) runTurn(t, "images", e);
  };
  const confirmTextOnly = () => {
    const t = pendingConfirm?.text;
    const e = pendingConfirm?.effort ?? "medium";
    setPendingConfirm(null);
    setCostAcknowledged(true);
    setImageModePref("text");
    if (t) runTurn(t, "text", e);
  };
  const cancelConfirm = () => setPendingConfirm(null);

  // Re-run the last request, this time reading scanned pages as images. Offered
  // after a text-only run when the folder has scanned pages that may hold
  // annexures the assistant couldn't find in the text.
  const retryWithImages = () => {
    if (!lastTurn || thinking || scanning) return;
    setCostAcknowledged(true);
    setImageModePref("images");
    runTurn(lastTurn.text, "images", lastTurn.effort);
  };
  // Show the retry affordance once a text-only run has happened over a folder
  // that contains unread scanned pages.
  const canRetryWithImages =
    !!folder &&
    !!folderScan?.ok &&
    (folderScan.scannedPageCount ?? 0) > 0 &&
    imageModePref === "text" &&
    !!lastTurn &&
    !thinking &&
    !scanning;

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Collapsed launcher ──
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg pl-3 pr-4 py-2.5 hover:opacity-90 transition-opacity"
        aria-label="Open Mayur"
      >
        <Sparkles className="h-4 w-4" />
        <span className="text-xs font-semibold">Mayur</span>
        <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-white/20">Beta</span>
      </button>
    );
  }

  // ── Expanded panel ──
  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 flex flex-col max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] rounded-xl border bg-background shadow-2xl overflow-hidden",
        expanded ? "w-[680px] h-[820px]" : "w-[380px] h-[520px]"
      )}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b bg-muted/40">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold">Mayur</span>
        <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Beta</span>
        <select
          value={model}
          onChange={(e) => changeModel(e.target.value)}
          disabled={thinking}
          title="Model used by the assistant"
          className="ml-auto h-6 rounded border border-border bg-background text-[10px] px-1 text-muted-foreground focus:outline-none disabled:opacity-50"
        >
          <option value="default">Default</option>
          <option value="haiku">Haiku</option>
          <option value="sonnet">Sonnet</option>
          <option value="opus">Opus</option>
        </select>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => setExpanded((v) => !v)} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label={expanded ? "Shrink" : "Expand"} title={expanded ? "Shrink" : "Expand"}>
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label="Minimize">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Prerequisite banner */}
      {prereqOk === false && (
        <div className="shrink-0 flex items-start gap-1.5 px-3 py-2 text-[11px] bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border-b border-amber-200 dark:border-amber-800/50">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Claude Code isn't detected yet. Open <span className="font-semibold">Settings → Mayur</span> to install it and Re-check, then reopen this panel.
          </span>
        </div>
      )}
      {prereqOk === true && (
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-[11px] bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-b border-green-200 dark:border-green-800/50">
          <CheckCircle className="h-3.5 w-3.5 shrink-0" /> Claude Code connected.
        </div>
      )}

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground mt-4 space-y-1.5 px-2">
            <Sparkles className="h-6 w-6 mx-auto opacity-40" />
            <p className="text-xs font-medium">Mayur — your drafting assistant</p>
            <p className="text-[11px] leading-relaxed">
              Pick a task below (or just tell me what to do) and I'll propose it straight into Drafto's fields for you to review and apply. Nothing is saved without your say-so.
            </p>
            <p className="text-[10px] leading-relaxed italic">
              Mayur works best with <span className="font-medium">text-based or OCR-enabled PDFs</span>, and uses your <span className="font-medium">Claude plan's credits</span> as you go.
            </p>
            <div className="text-left text-[10px] bg-muted/40 rounded-md p-2 space-y-1 mt-1">
              <p className="font-semibold text-foreground">For the best results, your prompt / folder should include:</p>
              <ul className="list-disc pl-3.5 space-y-0.5">
                <li>The <span className="font-medium">Impugned Judgment/Order</span> and the <span className="font-medium">full paperbook</span> filed in the court below (text-based or OCR'd PDFs).</li>
                <li>Who the <span className="font-medium">SLP Petitioners</span> are and their <span className="font-medium">position in the court below</span> (e.g. "all the appellants", "Petitioner No. 1 &amp; 2").</li>
                <li>Your <span className="font-medium">petition/case number</span> in the court below (especially for a batch matter, and whether the SLP covers all or only some petitions).</li>
                <li>For a single-judge order: whether an <span className="font-medium">intra-court appeal lies</span> — and, if it lies but you're bypassing it, why.</li>
                <li>Whether you want <span className="font-medium">interim relief</span>, and what (a stay or a custom relief).</li>
                <li>Any <span className="font-medium">deponent</span> details not in the paperbook (father's/husband's name; signing place).</li>
                <li>Any documents to annex that were <span className="font-medium">not before the court below</span> (additional documents).</li>
              </ul>
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "text-[11px] leading-relaxed rounded-lg px-2.5 py-1.5 max-w-[85%] whitespace-pre-wrap",
              m.role === "user" && "ml-auto bg-primary text-primary-foreground",
              m.role === "assistant" && "bg-muted text-foreground",
              m.role === "system" && "mx-auto bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-center italic"
            )}
          >
            {m.text}
          </div>
        ))}

        {showFillButton && !thinking && !pending && !pendingDocMap && !pendingConfirm && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">Want this entered into Drafto?</span>
            <Button type="button" size="sm" className="h-7 text-[11px]" onClick={fillFromChat}>
              Put this into Drafto
            </Button>
          </div>
        )}

        {canRetryWithImages && !pending && !pendingDocMap && !pendingConfirm && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              Missing something on the {folderScan?.scannedPageCount} scanned page{(folderScan?.scannedPageCount ?? 0) === 1 ? "" : "s"}?
            </span>
            <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={retryWithImages}>
              Retry, reading scanned pages as images
            </Button>
          </div>
        )}

        {thinking && (
          <div className="rounded-lg border bg-muted/30 p-2 space-y-1.5">
            <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1">
              {(steps.length ? steps : [{ id: "t", label: "Thinking…", done: false }]).map((s) => (
                <div key={s.id} className="flex items-center gap-1.5 text-[11px]">
                  {s.done ? (
                    <CheckCircle className="h-3 w-3 shrink-0 text-green-600 dark:text-green-400" />
                  ) : (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                  )}
                  <span className={cn("truncate", s.done ? "text-muted-foreground" : "text-foreground font-medium")}>{s.label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-end justify-between gap-2">
              <div className="text-[10px] text-muted-foreground tabular-nums leading-tight space-y-0.5">
                {startedAt && (
                  <div>
                    {formatElapsed(Date.now() - startedAt)}
                    {estimate && <span className="opacity-70"> · est {estimate}</span>}
                  </div>
                )}
                {usage && <div>↑ {fmtNum(usage.input)} in · ↓ {fmtNum(usage.output)} out</div>}
              </div>
              <button
                type="button"
                onClick={handleStop}
                className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border border-border hover:bg-muted"
              >
                Stop
              </button>
            </div>
          </div>
        )}

        {/* Suggest-before-write review card */}
        {pending && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-2.5 space-y-2">
            <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Suggested changes ({pending.preview.length})
            </p>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {pending.preview.map((c, i) => (
                <div key={i} className="text-[10px] leading-relaxed">
                  <span className="font-semibold text-foreground">{c.label}</span>
                  <span className="text-muted-foreground"> · {c.tab}</span>
                  {c.kind === "scalar" ? (
                    <div className="text-muted-foreground">
                      <span className="line-through opacity-60">{c.before}</span>
                      {" → "}
                      <span className="text-foreground">{c.after}</span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      Replaces {c.beforeCount} row{c.beforeCount === 1 ? "" : "s"} with {c.afterRows.length}:
                      <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                        {c.afterRows.slice(0, 6).map((r, ri) => (
                          <li key={ri} className="text-foreground">{r}</li>
                        ))}
                        {c.afterRows.length > 6 && <li className="opacity-60">…and {c.afterRows.length - 6} more</li>}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {pending.rejected.length > 0 && (
              <p className="text-[9px] text-amber-700 dark:text-amber-300">
                {pending.rejected.length} proposed change{pending.rejected.length === 1 ? " was" : "s were"} skipped as invalid.
              </p>
            )}
            <div className="flex items-center gap-2 pt-0.5">
              <Button type="button" size="sm" className="h-7 text-[11px] flex-1" onClick={applySuggestions}>
                Apply changes
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] flex-1" onClick={dismissSuggestions}>
                Dismiss
              </Button>
            </div>
            <p className="text-[9px] text-muted-foreground text-center">Applying fills the fields but doesn't save — review, then save the project yourself.</p>
          </div>
        )}

        {/* Per-task cost confirmation (shown before substantial folder tasks) */}
        {pendingConfirm && folderScan?.ok && (() => {
          const scanned = folderScan.scannedPageCount ?? 0;
          const textTok = folderScan.textTokens ?? 0;
          const imgTok = folderScan.imageTokens ?? 0;
          return (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-900/20 p-2.5 space-y-2">
              <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" /> Estimated usage for this task
              </p>
              <p className="text-[10px] text-amber-800/90 dark:text-amber-200/90 leading-relaxed">
                Reading your documents could use up to <span className="font-semibold">{fmtTokens(textTok)} tokens</span> of source text (the assistant reads only what it needs).
                {scanned > 0 && (
                  <> Plus <span className="font-semibold">{fmtTokens(imgTok)} tokens</span> to read {scanned} scanned page{scanned === 1 ? "" : "s"} as images.</>
                )}
                {" "}This counts against your Claude usage.
              </p>
              <p className="text-[10px] text-amber-800/90 dark:text-amber-200/90">
                Estimated time: <span className="font-semibold">{pendingConfirm ? estimateLabel(estimateContext, pendingConfirm.effort, model) : "—"}</span> <span className="opacity-70">(rough)</span>
              </p>
              {scanned > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <Button type="button" size="sm" className="h-7 text-[11px]" onClick={confirmImages}>
                    Proceed, incl. scanned pages ({fmtTokens(textTok + imgTok)})
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] flex-1" onClick={confirmTextOnly}>
                      Text only ({fmtTokens(textTok)})
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px] flex-1 text-muted-foreground" onClick={cancelConfirm}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" className="h-7 text-[11px] flex-1" onClick={confirmTextOnly}>
                    Proceed ({fmtTokens(textTok)})
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px] flex-1 text-muted-foreground" onClick={cancelConfirm}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          );
        })()}

        {/* Document-map review (split & attach) with thumbnails */}
        {pendingDocMap && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-2.5 space-y-2">
            <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Documents to split &amp; attach ({pendingDocMap.items.length})
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {pendingDocMap.items.map((it) => (
                <div key={it.id} className="flex gap-2 items-start">
                  {pendingDocMap.thumbs[it.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pendingDocMap.thumbs[it.id]} alt="" className={cn("border rounded bg-white shrink-0", expanded ? "w-24" : "w-12")} />
                  ) : (
                    <div className={cn("border rounded bg-muted shrink-0 flex items-center justify-center", expanded ? "w-24 h-32" : "w-12 h-16")}>
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  <div className="text-[10px] leading-snug min-w-0">
                    <div className="font-semibold text-foreground truncate">{it.doc.title || "(untitled)"}</div>
                    <div className="text-muted-foreground capitalize">
                      {it.doc.type.replace("_", " ")}
                      {it.doc.isAdditionalDocument ? " · AD" : ""}
                      {it.doc.date ? ` · ${it.doc.date}` : ""}
                    </div>
                    <div className="text-muted-foreground truncate">{it.doc.sourceFile} · pp. {it.doc.startPage}–{it.doc.endPage}</div>
                  </div>
                </div>
              ))}
            </div>
            {pendingDocMap.rejected.length > 0 && (
              <p className="text-[9px] text-amber-700 dark:text-amber-300">
                {pendingDocMap.rejected.length} proposed document{pendingDocMap.rejected.length === 1 ? "" : "s"} skipped (invalid range/overlap).
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" className="h-7 text-[11px] flex-1" onClick={approveDocMap} disabled={docSplitting}>
                {docSplitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Split & attach"}
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] flex-1" onClick={dismissDocMap} disabled={docSplitting}>
                Dismiss
              </Button>
            </div>
            <p className="text-[9px] text-muted-foreground text-center">
              Annexures attach to the matching List-of-Dates row; other document types are detected for later. Nothing is saved until you save the project.
            </p>
          </div>
        )}
      </div>

      {/* Folder chip + scan summary */}
      {folder && (
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-t bg-muted/30 text-[10px] text-muted-foreground">
          {scanning ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <FolderOpen className="h-3 w-3 shrink-0" />}
          <span className="truncate flex-1" title={folder}>
            {scanning
              ? "Reading PDFs…"
              : folderScan?.ok
                ? `${folderScan.files?.length ?? 0} PDF${(folderScan.files?.length ?? 0) === 1 ? "" : "s"} · ${fmtTokens(folderScan.textTokens ?? 0)} tokens of text${(folderScan.scannedPageCount ?? 0) > 0 ? ` · ${folderScan.scannedPageCount} scanned` : ""}`
                : folder}
          </span>
          <button type="button" onClick={clearFolder} className="hover:text-foreground" aria-label="Clear folder">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Quick-action presets */}
      {showPresets && (
        <div className="shrink-0 border-t p-2 max-h-48 overflow-y-auto space-y-2">
          {(["Tasks", "More"] as const).map((group) => {
            const items = PRESETS.filter((p) => p.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="space-y-1">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
                <div className="flex flex-wrap gap-1">
                  {items.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => runPreset(p.prompt, p.effort)}
                      disabled={prereqOk === false || thinking || scanning || !!pendingConfirm}
                      title={p.needsFolder && !folder ? "Pick a folder of source documents first for best results" : p.prompt}
                      className="text-[10px] px-2 py-1 rounded-full border border-border bg-background hover:bg-muted disabled:opacity-50"
                    >
                      {p.label}
                      <span className="opacity-60"> · {presetEstimate(p.effort)}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Composer */}
      <div className="shrink-0 border-t p-2 space-y-1.5">
        <div className="flex items-end gap-1.5">
          <Button
            type="button"
            variant={showPresets ? "default" : "outline"}
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setShowPresets((v) => !v)}
            title="Show tasks"
            disabled={prereqOk === false}
          >
            <Wand2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handlePickFolder}
            title="Point me at a folder of PDFs"
            disabled={checking || scanning || thinking}
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onInputKeyDown}
            rows={1}
            placeholder={prereqOk === false ? "Install Claude Code to begin…" : scanning ? "Reading PDFs…" : "Ask the assistant…"}
            disabled={prereqOk === false || thinking || scanning || !!pendingConfirm}
            className="flex-1 resize-none rounded-md border bg-background px-2.5 py-1.5 text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 max-h-24"
          />
          <Button
            type="button"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleSend}
            disabled={!input.trim() || prereqOk === false || thinking || scanning || !!pendingConfirm}
            title="Send"
          >
            {thinking || checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
        {usage && !thinking ? (
          <p className="text-[9px] text-muted-foreground text-center tabular-nums">
            Last turn: ↑ {fmtNum(usage.input)} in · ↓ {fmtNum(usage.output)} out tokens
          </p>
        ) : (
          <p className="text-[9px] text-muted-foreground text-center">
            Mayur · Beta · runs on your local Claude Code · Always review before saving.
          </p>
        )}
      </div>
    </div>
  );
}
