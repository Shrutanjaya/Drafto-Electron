"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Sparkles, X, Minus, FolderOpen, Send, Loader2, AlertCircle, CheckCircle, Wand2, Maximize2, Minimize2, RotateCcw, ChevronDown, ChevronRight, Settings2, Circle, FileStack, ArrowRight } from "lucide-react";
import { PRESETS } from "@/lib/ai/presets";
import { computeReadiness } from "@/lib/ai/readiness";
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
  // Granular per-step tasks are tucked away by default (Phase 1: one doorway).
  const [showPresets, setShowPresets] = useState(false);
  // Power-user knobs (model) live behind an Advanced toggle, off by default.
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Filing-readiness strip: expanded on demand.
  const [readinessOpen, setReadinessOpen] = useState(false);
  // List of Dates task: pending annexure-handling choice (shown as two buttons).
  const [lodPending, setLodPending] = useState<{ prompt: string; effort: Effort; model?: string } | null>(null);
  // Panel display: docked (bottom-right), popped-out (centred dialog), or full
  // (fills the window). Popout/full render over a dim backdrop.
  const [view, setView] = useState<'docked' | 'popout' | 'full'>('docked');
  // Claude Code session id, carried turn-to-turn so the conversation has memory.
  const [sessionId, setSessionId] = useState<string | null>(null);
  // When a folder has scanned pages, we ask the user before reading them as
  // images. The pending send is parked here until they choose.
  const [pendingConfirm, setPendingConfirm] = useState<{ text: string; effort: Effort; model?: string } | null>(null);

  const form = useFormContext();
  // Live filing-readiness, derived from the current form values (Phase 2).
  const watchedValues = useWatch({ control: form.control });
  const readiness = computeReadiness(watchedValues);
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

  // Pick specific files (PDF or Word) instead of a whole folder. Mirrors
  // handlePickFolder's context reset; the parent dir stands in for `folder` so
  // image-mode reading of any scanned pages still has a directory to open.
  const handlePickFiles = async () => {
    if (!window.electron?.aiSelectSourceFiles || !window.electron?.aiScanFiles) return;
    const paths = await window.electron.aiSelectSourceFiles();
    if (!paths || paths.length === 0) return;
    setFolderScan(null);
    setPendingDocMap(null);
    setCostAcknowledged(false);
    setImageModePref("text");
    setLastTurn(null);
    setSessionId(null);
    setShowPresets(true);
    setFolder(paths[0].replace(/[\\/][^\\/]*$/, "") || paths[0]);
    setScanning(true);
    try {
      const scan = await window.electron.aiScanFiles(paths);
      if (scan.ok) setFolderScan(scan);
      else addMessage("system", scan.error || "Couldn't read the selected files.");
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
  const submitText = (raw: string, effort: Effort = "medium", modelOverride?: string) => {
    const text = raw.trim();
    if (!text || thinking || scanning) return;
    // Warn before any substantial task: a folder with scanned pages (paid image
    // reading) OR a large amount of source text. Trivial tasks just run.
    const textTok = folderScan?.textTokens ?? 0;
    const scanned = folderScan?.scannedPageCount ?? 0;
    // Ask once per conversation; follow-ups reuse the remembered choice.
    if (folder && folderScan?.ok && !costAcknowledged && (scanned > 0 || textTok >= TOKEN_WARN_THRESHOLD)) {
      setPendingConfirm({ text, effort, model: modelOverride });
      return;
    }
    runTurn(text, imageModePref, effort, modelOverride);
  };
  const handleSend = () => submitText(input, "medium");
  const runPreset = (prompt: string, effort: Effort, modelOverride?: string) => {
    setShowPresets(false);
    submitText(prompt, effort, modelOverride);
  };

  // Annexure-handling suffixes for the List of Dates task (chosen via buttons).
  const LOD_DESCRIBE_SUFFIX =
    "\n\nANNEXURE HANDLING — the user chose: describe only. Record each annexure's details in its List-of-Dates row annexure entry (description/title, date, copy type, custom text, AD checkbox); never put an annexure description in the Particulars column. Do NOT produce a documents map and do NOT split or attach any PDFs.";
  const LOD_SPLIT_SUFFIX =
    "\n\nANNEXURE HANDLING — the user chose: split & attach (this uses many more tokens). Fill only the Date and Particulars in each List-of-Dates row — do NOT also fill the rows' annexure entries, because the documents map provides the annexures (filling both would duplicate them). Produce the documents map so Drafto splits the source PDFs into separate annexure files and attaches them to the matching rows, each with its description/date/copy type/AD flag. Never put an annexure description in the Particulars column.";
  const LOD_NONE_SUFFIX =
    "\n\nANNEXURE HANDLING — the user chose: neither attach nor mark annexures. Fill ONLY the Date and Particulars in each List-of-Dates row. Do NOT fill any annexure entries, do NOT produce a documents map, and do NOT split or attach any PDFs. Ignore annexures entirely.";

  // The List of Dates task first asks the user (via two buttons) how to handle
  // annexures; every other task runs immediately.
  const handlePreset = (p: { id: string; prompt: string; effort: Effort; model?: string }) => {
    if (p.id === "lod") {
      setLodPending({ prompt: p.prompt, effort: p.effort, model: p.model });
      setShowPresets(false);
      return;
    }
    runPreset(p.prompt, p.effort, p.model);
  };

  // The single doorway: draft the whole SLP from the source documents, in
  // dependency order, asking only the few human-only facts up front. Leans on the
  // "draft a full SLP from a folder" behaviour already in the master instructions.
  const DRAFT_EVERYTHING =
    "Draft the COMPLETE Special Leave Petition from the source documents. Work through the whole petition in dependency order: " +
    "(1) Preliminary — the Impugned Order(s), the parties / Memo of Parties, and the Deponent; " +
    "(2) Petition — the List of Dates & Events, the Grounds, the Questions of Law, the Synopsis, and Interim Relief only if the user wants it; " +
    "(3) the Listing Proforma general details. Fill every field via the JSON proposal — do not write the draft out in chat. " +
    "For the List of Dates annexures, record each annexure's details in its own row's annexure entry (title, date, copy type, AD flag); do NOT split or attach any PDFs unless the user explicitly asks. " +
    "Ask the few human-only facts you cannot determine from the documents — who the SLP Petitioners were in the court below and their position there; whether an intra-court appeal lies for a single-judge order; whether interim relief is wanted and what; and the batch scope — together, in one short message up front, then proceed. Complete the whole job; never hand work back.";
  const runDraftEverything = () => runPreset(DRAFT_EVERYTHING, "large", "sonnet");

  // Run the preset that best advances the first still-missing section.
  const runNextStep = () => {
    const p = PRESETS.find((x) => x.id === readiness.next?.presetId);
    if (p) handlePreset(p);
    else runDraftEverything();
  };

  // Phase 3: hand off to the paperbook compiler (opens the PDF paperbook dialog).
  const openPaperbook = () => window.dispatchEvent(new CustomEvent("drafto-open-paperbook"));

  // Intake pre-flight (recommendation #2): a cheap, read-only pass that inventories
  // the folder and flags whether the key documents are present — before spending a
  // full drafting turn. Reports in prose; proposes no field changes.
  const INTAKE_PROMPT =
    "Inventory the source documents ONLY — do not draft anything and do not propose any field changes. " +
    "First, list each document you can identify, with its type, its date, and a short label. " +
    "Then give a short PRESENT / MISSING checklist for these key items: the impugned judgment/order under challenge; the complete High Court paperbook or petition (with its annexures); the memo/list of parties; and any executed affidavit or vakalatnama. " +
    "If any key item is missing, or you can't tell which file it is, say so plainly and ask the user to add it to the folder or point you to it. Keep it brief.";
  const runIntakeCheck = () => runPreset(INTAKE_PROMPT, "small", "haiku");

  // Soft-gate (recommendation #1): the one-doorway draft needs source documents.
  // With no folder chosen, first open the folder picker rather than run empty.
  const hasSources = !!folder && !!folderScan?.ok;
  const handlePrimaryDraft = () => {
    if (!hasSources) { handlePickFolder(); return; }
    (readiness.doneCount > 0 ? runNextStep : runDraftEverything)();
  };

  // Import affordance: place the user's OWN existing draft text into the matching
  // Drafto fields verbatim — a transcription task, not a drafting task.
  const IMPORT_PROMPT =
    "This is an IMPORT / transcription task, NOT a drafting task. I have existing draft text in the source documents that I want placed into Drafto's fields as I wrote it. " +
    "For each source file that is a finished draft of an SLP section, transcribe its text into the matching Drafto field via the JSON proposal, preserving my wording (only adjust obvious formatting to fit the field). Map by content: a memo / list of parties → Parties; a chronological list of dates → List of Dates; grounds → Grounds; questions of law → Questions of Law; a synopsis → Synopsis; interim-relief grounds/prayers → Interim Relief. " +
    "Do NOT redraft, rephrase or 'improve' the text, and do NOT invent content. If you're unsure which section a file maps to, or which file to import, ask me first.";
  const runImportDraft = () => {
    if (!hasSources) { handlePickFiles(); return; }
    runPreset(IMPORT_PROMPT, "medium", "haiku");
  };

  // Reset the conversation: clear context and start a fresh Mayur session. Keeps
  // the selected source folder so the user can re-run tasks on the same documents.
  const resetChat = () => {
    if (thinking) return;
    setMessages([]);
    setSessionId(null);
    setPending(null);
    setPendingDocMap(null);
    setPendingConfirm(null);
    setLodPending(null);
    setLastTurn(null);
    setUsage(null);
    setSteps([]);
    setCostAcknowledged(false);
    setImageModePref("text");
    setShowPresets(true);
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
  // modelOverride = a task's recommended model; used only when the user hasn't
  // explicitly picked a model (dropdown on "Default").
  const runTurn = async (text: string, mode: "text" | "images", effort: Effort = "medium", modelOverride?: string) => {
    addMessage("user", text);
    setLastTurn({ text, effort });
    setInput("");
    setPending(null);
    setPendingDocMap(null);
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
        // Explicit dropdown choice wins; otherwise use the task's recommended model.
        model: model && model !== "default" ? model : (modelOverride || undefined),
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
      else if (looksLikeFailedJson) addMessage("system", "I drafted this, but couldn't format it cleanly into Drafto's fields. Please send that request again.");
      else if (!proposal) addMessage("assistant", replyText || "(no response)");

      if (proposal) presentFieldOps(proposal);
      // A "documents" map → split-and-attach review (annexures etc.).
      if (proposal?.documents) presentDocMap(proposal.documents);
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
    const mdl = pendingConfirm?.model;
    setPendingConfirm(null);
    setCostAcknowledged(true);
    setImageModePref("images");
    if (t) runTurn(t, "images", e, mdl);
  };
  const confirmTextOnly = () => {
    const t = pendingConfirm?.text;
    const e = pendingConfirm?.effort ?? "medium";
    const mdl = pendingConfirm?.model;
    setPendingConfirm(null);
    setCostAcknowledged(true);
    setImageModePref("text");
    if (t) runTurn(t, "text", e, mdl);
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

  // ── Open panel ──
  return (
    <>
      {view !== 'docked' && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setView('docked')} aria-hidden="true" />
      )}
    <div
      className={cn(
        "mayur-panel fixed z-50 flex flex-col rounded-xl border bg-background shadow-2xl overflow-hidden",
        view === 'docked' && "bottom-4 right-4 w-[380px] h-[520px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]",
        view === 'popout' && "inset-0 m-auto w-[min(92vw,920px)] h-[88vh]",
        view === 'full' && "inset-2"
      )}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b bg-muted/40">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold">Mayur</span>
        <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Beta</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" onClick={() => setShowAdvanced((v) => !v)} className={cn("p-1 rounded hover:bg-muted", showAdvanced ? "text-primary" : "text-muted-foreground")} aria-label="Advanced settings" title="Advanced settings">
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={resetChat} disabled={thinking} className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-40" aria-label="New chat" title="New chat — clear context and start fresh">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          {view === 'docked' ? (
            <button type="button" onClick={() => setView('popout')} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label="Pop out" title="Pop out to a larger window">
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setView(view === 'full' ? 'popout' : 'full')} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label={view === 'full' ? "Exit full screen" : "Full screen"} title={view === 'full' ? "Exit full screen" : "Full screen"}>
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setView('docked')} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label="Dock" title="Dock to corner">
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button type="button" onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label="Minimize">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Advanced knobs — hidden by default (Phase 1: no clutter) */}
      {showAdvanced && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b bg-muted/20 text-[10px] text-muted-foreground">
          <span>Model</span>
          <select
            value={model}
            onChange={(e) => changeModel(e.target.value)}
            disabled={thinking}
            title="Model used by the assistant"
            className="h-6 rounded border border-border bg-background text-[10px] px-1 focus:outline-none disabled:opacity-50"
          >
            <option value="default">Default (auto)</option>
            <option value="haiku">Haiku</option>
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
          </select>
          <span className="ml-auto opacity-70">runs on your local Claude Code</span>
        </div>
      )}

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

      {/* Filing readiness (Phase 2) — a live view of what's drafted and what's next */}
      <div className="shrink-0 border-b">
        <button
          type="button"
          onClick={() => setReadinessOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30"
          title="What's drafted so far"
        >
          {readinessOpen ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
          <span className="text-[10px] font-medium text-foreground shrink-0">Filing readiness</span>
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${readiness.percent}%` }} />
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">{readiness.doneCount}/{readiness.total}</span>
        </button>
        {readinessOpen && (
          <div className="px-3 pb-2 space-y-1.5">
            <div className="space-y-1">
              {readiness.sections.map((s) => (
                <div key={s.id} className="flex items-start gap-1.5 text-[10px] leading-snug">
                  {s.done
                    ? <CheckCircle className="h-3 w-3 shrink-0 text-green-600 dark:text-green-400 mt-px" />
                    : <Circle className="h-3 w-3 shrink-0 text-muted-foreground/40 mt-px" />}
                  <span className={cn("shrink-0", s.done ? "text-muted-foreground" : "text-foreground")}>{s.label}</span>
                  {!s.done && s.missing.length > 0 && (
                    <span className="text-muted-foreground truncate">· needs {s.missing.slice(0, 2).join(", ")}{s.missing.length > 2 ? "…" : ""}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 pt-0.5">
              {readiness.next ? (
                <Button type="button" size="sm" className="h-7 text-[11px] flex-1 gap-1" onClick={runNextStep} disabled={prereqOk === false || thinking || scanning || !!pendingConfirm}>
                  <ArrowRight className="h-3.5 w-3.5" /> Draft {readiness.next.label.toLowerCase()}
                </Button>
              ) : (
                <span className="flex-1 text-[10px] text-green-700 dark:text-green-400 inline-flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> All sections drafted</span>
              )}
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={openPaperbook} title="Open the paperbook compiler">
                <FileStack className="h-3.5 w-3.5" /> Compile
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {messages.length === 0 && (
          <div className="mt-2 space-y-3 px-1">
            <div className="text-center space-y-1">
              <Sparkles className="h-6 w-6 mx-auto text-primary/60" />
              <p className="text-xs font-semibold text-foreground">Draft your SLP with Mayur</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Point me at your paperbook and I'll draft the whole petition into Drafto's fields for you to review. Nothing is saved without your say-so.
              </p>
            </div>

            {!hasSources && (
              <div className="space-y-1">
                <Button type="button" variant="outline" className="w-full h-9 text-[11px] gap-2" onClick={handlePickFolder} disabled={checking || scanning}>
                  <FolderOpen className="h-4 w-4" /> Choose your case documents
                </Button>
                <button type="button" onClick={handlePickFiles} disabled={checking || scanning} className="w-full text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50">
                  or pick specific files (PDF or Word)
                </button>
              </div>
            )}

            {/* What Mayur ingested (recommendation #3) + intake check (recommendation #2) */}
            {hasSources && (
              <div className="rounded-md border bg-muted/30 p-2 space-y-1.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-medium text-foreground inline-flex items-center gap-1">
                    <FolderOpen className="h-3 w-3" /> {folderScan!.files?.length ?? 0} document{(folderScan!.files?.length ?? 0) === 1 ? "" : "s"} ready
                  </span>
                  <button type="button" onClick={handlePickFolder} disabled={scanning} className="text-muted-foreground hover:text-foreground disabled:opacity-50">change</button>
                </div>
                <ul className="space-y-0.5 max-h-24 overflow-y-auto text-[10px] text-muted-foreground">
                  {(folderScan!.files ?? []).map((f) => (
                    <li key={f.name} className="flex items-center justify-between gap-2">
                      <span className="truncate" title={f.name}>{f.name}</span>
                      <span className="shrink-0 tabular-nums">{f.pageCount}p{f.scannedPages.length > 0 ? " · scanned" : ""}</span>
                    </li>
                  ))}
                </ul>
                <Button type="button" variant="outline" size="sm" className="w-full h-7 text-[10px] gap-1.5" onClick={runIntakeCheck} disabled={prereqOk === false || thinking || scanning || !!pendingConfirm}>
                  <CheckCircle className="h-3.5 w-3.5" /> Check these documents first
                </Button>
              </div>
            )}

            <Button
              type="button"
              className="w-full h-10 text-[12px] gap-2"
              onClick={handlePrimaryDraft}
              disabled={prereqOk === false || thinking || scanning || !!pendingConfirm}
              title={!hasSources ? "Choose your case documents first" : undefined}
            >
              <Wand2 className="h-4 w-4" />
              {readiness.doneCount > 0 && readiness.next ? `Continue — draft ${readiness.next.label.toLowerCase()}` : "Draft my SLP"}
            </Button>
            {readiness.doneCount > 0 && (
              <button type="button" onClick={runDraftEverything} disabled={prereqOk === false || thinking || scanning} className="w-full text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50">
                or re-draft everything from the documents
              </button>
            )}

            <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
              <button type="button" onClick={() => setShowPresets((v) => !v)} className="hover:text-foreground inline-flex items-center gap-0.5">
                a specific step {showPresets ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              <button type="button" onClick={runImportDraft} disabled={prereqOk === false || thinking || scanning || !!pendingConfirm} className="hover:text-foreground disabled:opacity-50">
                import an existing draft
              </button>
            </div>

            <details className="text-[10px] text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground text-center list-none">what to include for the best draft</summary>
              <div className="text-left bg-muted/40 rounded-md p-2 space-y-1 mt-1.5">
                <ul className="list-disc pl-3.5 space-y-0.5">
                  <li>The <span className="font-medium">impugned judgment/order</span> and the <span className="font-medium">full paperbook</span> filed below (text-based or OCR'd PDFs).</li>
                  <li>Who the <span className="font-medium">SLP petitioners</span> are and their <span className="font-medium">position in the court below</span>.</li>
                  <li>Your <span className="font-medium">petition/case number</span> below (and, for a batch, whether the SLP covers all or some).</li>
                  <li>For a single-judge order: whether an <span className="font-medium">intra-court appeal lies</span> (and why you're bypassing it).</li>
                  <li>Whether you want <span className="font-medium">interim relief</span>, and what.</li>
                  <li>Any <span className="font-medium">deponent</span> details or <span className="font-medium">additional documents</span> not in the paperbook.</li>
                </ul>
              </div>
            </details>
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

        {lodPending && !thinking && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-2 space-y-1.5">
            <p className="text-[11px] text-foreground">List of Dates — how should I handle the annexures?</p>
            <div className="flex flex-col gap-1.5">
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] justify-start" onClick={() => { const x = lodPending; setLodPending(null); runPreset(x.prompt + LOD_DESCRIBE_SUFFIX, x.effort, x.model); }}>
                Only describe annexures (faster)
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] justify-start" onClick={() => { const x = lodPending; setLodPending(null); runPreset(x.prompt + LOD_SPLIT_SUFFIX, x.effort, x.model); }}>
                Split &amp; attach annexure PDFs (uses many more tokens)
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] justify-start" onClick={() => { const x = lodPending; setLodPending(null); runPreset(x.prompt + LOD_NONE_SUFFIX, x.effort, x.model); }}>
                Neither — just dates &amp; particulars
              </Button>
              <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground self-start" onClick={() => setLodPending(null)}>Cancel</button>
            </div>
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
                    <img src={pendingDocMap.thumbs[it.id]} alt="" className={cn("border rounded bg-white shrink-0", view !== 'docked' ? "w-24" : "w-12")} />
                  ) : (
                    <div className={cn("border rounded bg-muted shrink-0 flex items-center justify-center", view !== 'docked' ? "w-24 h-32" : "w-12 h-16")}>
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

      {/* Quick-action presets — the assistant's step-by-step playbook, tucked away */}
      {showPresets && (
        <div className="shrink-0 border-t p-2 max-h-52 overflow-y-auto space-y-2">
          <Button type="button" className="w-full h-8 text-[11px] gap-1.5" onClick={() => (hasSources ? runDraftEverything() : handlePickFolder())} disabled={prereqOk === false || thinking || scanning || !!pendingConfirm}>
            <Wand2 className="h-3.5 w-3.5" /> Draft my SLP — everything
          </Button>
          <Button type="button" variant="outline" className="w-full h-7 text-[10px] gap-1.5" onClick={runImportDraft} disabled={prereqOk === false || thinking || scanning || !!pendingConfirm}>
            <FolderOpen className="h-3.5 w-3.5" /> Import an existing draft into fields
          </Button>
          <p className="text-[9px] text-muted-foreground text-center">or run one step at a time:</p>
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
                      onClick={() => handlePreset(p)}
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
        {usage && !thinking && (
          <p className="text-[9px] text-muted-foreground text-center tabular-nums">
            ↑ {fmtNum(usage.input)} in · ↓ {fmtNum(usage.output)} out
          </p>
        )}
      </div>
    </div>
    </>
  );
}
