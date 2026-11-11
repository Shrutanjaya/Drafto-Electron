// ── Mayur Multi-LLM Direct API Engine (Gemini, Anthropic Claude, OpenAI) ────
// Stores API keys strictly locally on the user's machine (encrypted via
// Electron's safeStorage when available), auto-discovers live model lists from
// each provider's API (with a curated built-in fallback catalog), and streams
// completions with instant cancellation support.

const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

const PROVIDERS = ["gemini", "anthropic", "openai"];

// Curated default models shown immediately and merged with live API models.
const DEFAULT_MODELS = {
  gemini: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (Recommended for complex drafting)" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (Fast & cost-effective)" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 (Recommended)" },
    { id: "claude-opus-4-5", label: "Claude Opus 4.5 (Most capable)" },
    { id: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet" },
    { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
    { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku (Fast)" },
  ],
  openai: [
    { id: "gpt-4.1", label: "GPT-4.1 (Recommended for legal drafting)" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "o3", label: "o3 (Deep reasoning)" },
    { id: "o4-mini", label: "o4-mini (Fast reasoning)" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 Mini (Fast)" },
  ],
};

function keysFilePath() {
  return path.join(app.getPath("userData"), "mayur-keys.json");
}

function modelsCacheFilePath() {
  return path.join(app.getPath("userData"), "mayur-models-cache.json");
}

function encryptString(plain) {
  if (!plain) return "";
  try {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return "enc:" + safeStorage.encryptString(plain).toString("base64");
    }
  } catch {}
  return "b64:" + Buffer.from(plain, "utf8").toString("base64");
}

function decryptString(stored) {
  if (!stored || typeof stored !== "string") return "";
  try {
    if (stored.startsWith("enc:")) {
      const buf = Buffer.from(stored.slice(4), "base64");
      return safeStorage.decryptString(buf);
    }
    if (stored.startsWith("b64:")) {
      return Buffer.from(stored.slice(4), "base64").toString("utf8");
    }
  } catch {}
  return "";
}

function readRawKeyStore() {
  try {
    const p = keysFilePath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8")) || {};
    }
  } catch {}
  return {};
}

function writeRawKeyStore(store) {
  try {
    const p = keysFilePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(store, null, 2), "utf8");
  } catch (e) {
    console.error("[Mayur] Failed to save key store:", e.message);
  }
}

function getApiKey(provider) {
  const store = readRawKeyStore();
  return decryptString(store[provider] || "");
}

function maskKey(key) {
  if (!key || key.length < 8) return "";
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

function readModelsCache() {
  try {
    const p = modelsCacheFilePath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8")) || {};
    }
  } catch {}
  return {};
}

function writeModelsCache(cache) {
  try {
    const p = modelsCacheFilePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(cache, null, 2), "utf8");
  } catch {}
}

function mergeWithDefaults(provider, liveModels) {
  const defaults = DEFAULT_MODELS[provider] || [];
  const seen = new Set();
  const out = [];

  for (const m of liveModels || []) {
    if (!m || !m.id || seen.has(m.id)) continue;
    seen.add(m.id);
    const matchingDefault = defaults.find((d) => d.id === m.id);
    out.push({
      id: m.id,
      label: matchingDefault ? matchingDefault.label : (m.label || m.id),
    });
  }
  for (const d of defaults) {
    if (!seen.has(d.id)) {
      seen.add(d.id);
      out.push(d);
    }
  }
  return out;
}

function getKeysStatus() {
  const cache = readModelsCache();
  const status = {};
  for (const p of PROVIDERS) {
    const key = getApiKey(p);
    status[p] = {
      hasKey: !!key,
      masked: maskKey(key),
      models: mergeWithDefaults(p, cache[p]?.models || []),
      updatedAt: cache[p]?.updatedAt || null,
    };
  }
  return status;
}

async function fetchProviderModelsFromApi(provider, apiKey) {
  const key = (apiKey && apiKey.trim()) || getApiKey(provider);
  if (!key) {
    return { ok: false, error: "No API key configured for this provider.", models: DEFAULT_MODELS[provider] || [] };
  }

  try {
    if (provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=100`;
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API (${res.status}): ${extractApiError(errText)}`);
      }
      const data = await res.json();
      const rawModels = Array.isArray(data.models) ? data.models : [];
      const filtered = rawModels
        .filter((m) => {
          const name = String(m.name || "").replace(/^models\//, "");
          const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
          if (!methods.includes("generateContent")) return false;
          if (!name.startsWith("gemini-")) return false;
          if (/embedding|imagen|aqa|tts|vision|learnlm|gemma|bison/i.test(name)) return false;
          return true;
        })
        .map((m) => {
          const id = String(m.name || "").replace(/^models\//, "");
          const label = m.displayName ? `${m.displayName} (${id})` : id;
          return { id, label };
        })
        .sort((a, b) => b.id.localeCompare(a.id));

      const merged = mergeWithDefaults("gemini", filtered);
      const cache = readModelsCache();
      cache.gemini = { models: merged, updatedAt: new Date().toISOString() };
      writeModelsCache(cache);
      return { ok: true, models: merged };
    }

    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
        method: "GET",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Anthropic API (${res.status}): ${extractApiError(errText)}`);
      }
      const data = await res.json();
      const rawModels = Array.isArray(data.data) ? data.data : [];
      const filtered = rawModels
        .filter((m) => m && m.id && /^claude-/i.test(m.id))
        .map((m) => ({
          id: m.id,
          label: m.display_name ? `${m.display_name} (${m.id})` : m.id,
        }));

      const merged = mergeWithDefaults("anthropic", filtered);
      const cache = readModelsCache();
      cache.anthropic = { models: merged, updatedAt: new Date().toISOString() };
      writeModelsCache(cache);
      return { ok: true, models: merged };
    }

    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
        },
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI API (${res.status}): ${extractApiError(errText)}`);
      }
      const data = await res.json();
      const rawModels = Array.isArray(data.data) ? data.data : [];
      const filtered = rawModels
        .filter((m) => {
          const id = String(m?.id || "");
          if (!/^(gpt-5|gpt-4\.1|gpt-4o|gpt-4-turbo|o1|o3|o4|chatgpt-4o)/i.test(id)) return false;
          if (/audio|realtime|tts|transcribe|whisper|dall-e|embedding|moderation|search|image|instruct/i.test(id)) return false;
          return true;
        })
        .sort((a, b) => (b.created || 0) - (a.created || 0))
        .map((m) => ({ id: m.id, label: m.id }));

      const merged = mergeWithDefaults("openai", filtered);
      const cache = readModelsCache();
      cache.openai = { models: merged, updatedAt: new Date().toISOString() };
      writeModelsCache(cache);
      return { ok: true, models: merged };
    }

    return { ok: false, error: `Unknown provider: ${provider}`, models: [] };
  } catch (e) {
    return {
      ok: false,
      error: e.message || String(e),
      models: mergeWithDefaults(provider, readModelsCache()[provider]?.models || []),
    };
  }
}

async function saveApiKey({ provider, apiKey }) {
  if (!PROVIDERS.includes(provider)) {
    return { ok: false, error: `Unsupported provider: ${provider}` };
  }
  const store = readRawKeyStore();
  const trimmed = String(apiKey || "").trim();
  if (!trimmed) {
    delete store[provider];
    writeRawKeyStore(store);
    return { ok: true, hasKey: false, masked: "", models: DEFAULT_MODELS[provider] || [] };
  }

  store[provider] = encryptString(trimmed);
  writeRawKeyStore(store);

  // Verify the key and refresh live models immediately
  const modelRes = await fetchProviderModelsFromApi(provider, trimmed);
  return {
    ok: modelRes.ok,
    hasKey: true,
    masked: maskKey(trimmed),
    models: modelRes.models,
    error: modelRes.ok ? undefined : modelRes.error,
  };
}

function extractApiError(rawText) {
  if (!rawText) return "Unknown error";
  try {
    const j = JSON.parse(rawText);
    if (j.error) {
      if (typeof j.error === "string") return j.error;
      if (typeof j.error.message === "string") return j.error.message;
    }
    if (typeof j.message === "string") return j.message;
  } catch {}
  return String(rawText).slice(0, 300);
}

// Friendly field labels for live streaming status updates
const AI_FIELD_LABELS = {
  caseType: "Case Type",
  petitioners: "Petitioners",
  respondents: "Respondents",
  commonOrderParties: "Common Order Parties",
  impugnedOrders: "Impugned Order(s)",
  synopsis: "Synopsis",
  listOfDates: "List of Dates",
  questionsOfLaw: "Questions of Law",
  grounds: "Grounds",
  wantsInterimRelief: "Interim Relief",
  interimReliefGrounds: "Interim Relief Grounds",
  interimReliefPrayers: "Interim Relief Prayers",
  customIas: "Custom Applications",
  "wp.reliefs": "Reliefs",
  "wp.facts": "Facts",
  "oa.reliefs": "Reliefs",
  "oa.facts": "Facts",
  "oa.mas": "Miscellaneous Applications",
};

function aiFieldLabel(fieldPath) {
  if (AI_FIELD_LABELS[fieldPath]) return AI_FIELD_LABELS[fieldPath];
  if (fieldPath.startsWith("standardIas.")) return "Application (IA)";
  if (fieldPath.startsWith("wp.cms.")) return "CM Application";
  if (fieldPath.startsWith("advocate.")) return "Advocate details";
  if (fieldPath.startsWith("deponent.")) return "Deponent";
  if (fieldPath.startsWith("listingProforma")) return "Listing Proforma";
  if (fieldPath.startsWith("checklist.")) return "Advocate's Checklist";
  const seg = String(fieldPath).split(".").pop() || String(fieldPath);
  return seg.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

// Assemble extracted source material from contextDir (created by scanFolder / scanFiles)
function loadContextDirMaterial(contextDir) {
  if (!contextDir || typeof contextDir !== "string" || !fs.existsSync(contextDir)) {
    return "";
  }
  try {
    const entries = fs.readdirSync(contextDir).filter((f) => f.toLowerCase().endsWith(".txt")).sort();
    if (entries.length === 0) return "";
    const blocks = [];
    for (const fname of entries) {
      const full = path.join(contextDir, fname);
      const content = fs.readFileSync(full, "utf8");
      blocks.push(`=== DOCUMENT FILE: ${fname} ===\n${content}`);
    }
    return `\n\n<case_material>\nThe following source documents have been extracted from the user's files:\n\n${blocks.join("\n\n")}\n</case_material>\n`;
  } catch {
    return "";
  }
}

let activeAbortController = null;
let cancelRequested = false;

function cancelActiveLlm() {
  if (activeAbortController) {
    cancelRequested = true;
    try {
      activeAbortController.abort();
    } catch {}
    return { ok: true };
  }
  return { ok: false };
}

function isRetryableError(errMsg) {
  if (!errMsg) return false;
  const str = String(errMsg).toLowerCase();
  return (
    str.includes("429") ||
    str.includes("quota") ||
    str.includes("rate") ||
    str.includes("resource_exhausted") ||
    str.includes("503") ||
    str.includes("high demand") ||
    str.includes("spikes in demand") ||
    str.includes("service unavailable") ||
    str.includes("502") ||
    str.includes("504") ||
    str.includes("bad gateway") ||
    str.includes("gateway timeout") ||
    str.includes("500") ||
    str.includes("fetch failed") ||
    str.includes("econnreset") ||
    str.includes("etimedout") ||
    str.includes("network error")
  );
}

function parseRetryDelayMs(errMsg, attempt) {
  const str = String(errMsg || "");
  const msMatch = str.match(/retry\s+in\s+([0-9]+(?:\.[0-9]+)?)\s*ms/i);
  if (msMatch) {
    return Math.ceil(parseFloat(msMatch[1])) + 1500;
  }
  const sMatch = str.match(/retry\s+in\s+([0-9]+(?:\.[0-9]+)?)\s*s/i);
  if (sMatch) {
    return Math.ceil(parseFloat(sMatch[1]) * 1000) + 1500;
  }
  const is429 = /429|quota|rate|resource_exhausted/i.test(str);
  const base = is429 ? 4000 * attempt : 3000 * Math.pow(1.5, attempt - 1);
  const jitter = Math.floor(Math.random() * 1000);
  return Math.min(25000, Math.round(base + jitter));
}

async function runLlm(opts, sendStream) {
  opts = opts || {};
  const provider = opts.provider || "gemini";
  const model = opts.model || (DEFAULT_MODELS[provider]?.[0]?.id ?? "gemini-2.5-pro");
  const apiKey = (opts.apiKey && opts.apiKey.trim()) || getApiKey(provider);

  if (!apiKey) {
    return {
      ok: false,
      needsKey: true,
      error: `No API key found for ${provider === "gemini" ? "Google Gemini" : provider === "anthropic" ? "Anthropic (Claude)" : "OpenAI (ChatGPT)"}. Please enter your API key in Settings → Mayur (AI).`,
    };
  }

  // Gather any context directories passed in addDirs or contextDir
  const dirs = Array.isArray(opts.addDirs) && opts.addDirs.length
    ? opts.addDirs
    : opts.contextDir
    ? [opts.contextDir]
    : [];
  let materialBlock = "";
  for (const d of dirs) {
    materialBlock += loadContextDirMaterial(d);
  }

  const systemPrompt = String(opts.systemPrompt || "").trim();
  const userPrompt = String(opts.prompt || "").trim() + materialBlock;

  const send = (payload) => {
    if (typeof sendStream === "function") sendStream(payload);
  };

  let lastStatus = null;
  const sendStatus = (text) => {
    if (text && text !== lastStatus) {
      lastStatus = text;
      send({ kind: "status", text });
    }
  };

  let genBuf = "";
  const announced = new Set();
  const scanGeneration = () => {
    const re = /"path"\s*:\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(genBuf))) {
      const p = m[1];
      if (!announced.has(p)) {
        announced.add(p);
        sendStatus(`Filling ${aiFieldLabel(p)}…`);
      }
    }
    if (!announced.has("__docs") && /"documents"\s*:/.test(genBuf)) {
      announced.add("__docs");
      sendStatus("Mapping annexures…");
    }
  };

  const estInputTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
  let lastUsageAt = 0;
  const sendUsage = (force) => {
    const now = Date.now();
    if (!force && now - lastUsageAt < 500) return;
    lastUsageAt = now;
    send({
      kind: "usage",
      input: estInputTokens,
      output: Math.ceil(genBuf.length / 4),
    });
  };

  cancelRequested = false;

  const maxAttempts = 4;
  let recordedUsage = {
    inputTokens: estInputTokens,
    outputTokens: 0,
    totalTokens: estInputTokens,
  };

  const handleLiveUsage = (inp, out) => {
    if (typeof inp === "number" && inp > 0) recordedUsage.inputTokens = inp;
    if (typeof out === "number" && out >= 0) recordedUsage.outputTokens = out;
    recordedUsage.totalTokens = recordedUsage.inputTokens + (recordedUsage.outputTokens || Math.ceil(genBuf.length / 4));
    send({
      kind: "usage",
      input: recordedUsage.inputTokens,
      output: recordedUsage.outputTokens || Math.ceil(genBuf.length / 4),
      total: recordedUsage.totalTokens,
    });
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (cancelRequested) {
      cancelRequested = false;
      return { ok: false, cancelled: true, error: "Stopped." };
    }

    const controller = new AbortController();
    activeAbortController = controller;

    let wasTruncated = false;
    const setTruncated = () => { wasTruncated = true; };

    genBuf = "";
    announced.clear();

    if (attempt === 1) {
      sendStatus("Sending request to " + (provider === "gemini" ? "Gemini" : provider === "anthropic" ? "Claude" : "OpenAI") + "…");
      sendUsage(true);
    }

    try {
      if (provider === "gemini") {
        await streamGemini({
          apiKey,
          model,
          systemPrompt,
          userPrompt,
          signal: controller.signal,
          onDelta: (chunk) => {
            if (genBuf.length === 0) sendStatus("Generating draft…");
            genBuf += chunk;
            scanGeneration();
            sendUsage(false);
          },
          onThinking: () => {
            if (announced.size === 0) sendStatus("Reasoning…");
          },
          onTruncated: setTruncated,
          onUsage: handleLiveUsage,
        });
      } else if (provider === "anthropic") {
        await streamAnthropic({
          apiKey,
          model,
          systemPrompt,
          userPrompt,
          signal: controller.signal,
          onDelta: (chunk) => {
            if (genBuf.length === 0) sendStatus("Generating draft…");
            genBuf += chunk;
            scanGeneration();
            sendUsage(false);
          },
          onThinking: () => {
            if (announced.size === 0) sendStatus("Reasoning…");
          },
          onTruncated: setTruncated,
          onUsage: handleLiveUsage,
        });
      } else if (provider === "openai") {
        await streamOpenAI({
          apiKey,
          model,
          systemPrompt,
          userPrompt,
          signal: controller.signal,
          onDelta: (chunk) => {
            if (genBuf.length === 0) sendStatus("Generating draft…");
            genBuf += chunk;
            scanGeneration();
            sendUsage(false);
          },
          onTruncated: setTruncated,
          onUsage: handleLiveUsage,
        });
      } else {
        throw new Error(`Unsupported LLM provider: ${provider}`);
      }

      sendUsage(true);
      activeAbortController = null;
      const finalOut = recordedUsage.outputTokens || Math.ceil(genBuf.length / 4);
      const finalTotal = recordedUsage.inputTokens + finalOut;

      if (genBuf.trim().length === 0) {
        if (attempt < maxAttempts && !cancelRequested) {
          sendStatus(`Empty response from model. Retrying… (attempt ${attempt + 1}/${maxAttempts})`);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        return {
          ok: false,
          error: "The AI model returned an empty response (0 tokens). If using an experimental/preview model, try selecting Gemini 2.5 Pro or Gemini 2.5 Flash in Settings.",
          partialText: "",
          inputTokens: recordedUsage.inputTokens,
          outputTokens: 0,
          usage: {
            inputTokens: recordedUsage.inputTokens,
            outputTokens: 0,
            totalTokens: recordedUsage.inputTokens,
          },
        };
      }

      return {
        ok: true,
        text: genBuf,
        truncated: wasTruncated,
        inputTokens: recordedUsage.inputTokens,
        outputTokens: finalOut,
        usage: {
          inputTokens: recordedUsage.inputTokens,
          outputTokens: finalOut,
          totalTokens: finalTotal,
        },
      };
    } catch (err) {
      activeAbortController = null;
      const finalOut = recordedUsage.outputTokens || Math.ceil(genBuf.length / 4);
      const finalTotal = recordedUsage.inputTokens + finalOut;
      const errorUsage = {
        inputTokens: recordedUsage.inputTokens,
        outputTokens: finalOut,
        totalTokens: finalTotal,
      };

      if (cancelRequested || err?.name === "AbortError") {
        cancelRequested = false;
        return {
          ok: false,
          cancelled: true,
          error: "Stopped.",
          truncated: wasTruncated,
          partialText: genBuf,
          inputTokens: recordedUsage.inputTokens,
          outputTokens: finalOut,
          usage: errorUsage,
        };
      }

      const errMsg = (err.cause ? `${err.message} (${err.cause})` : err.message) || String(err);
      const retryable = isRetryableError(errMsg);

      if (retryable && attempt < maxAttempts) {
        const waitMs = parseRetryDelayMs(errMsg, attempt);
        const is429 = /429|quota|rate|resource_exhausted/i.test(errMsg);
        const reason = is429 ? "Rate limit reached" : "Provider busy / High demand";
        sendStatus(`${reason}. Waiting ${Math.ceil(waitMs / 1000)}s before retry… (attempt ${attempt + 1}/${maxAttempts})`);

        await new Promise((resolve) => setTimeout(resolve, waitMs));
        if (cancelRequested) {
          cancelRequested = false;
          return {
            ok: false,
            cancelled: true,
            error: "Stopped.",
            truncated: wasTruncated,
            partialText: genBuf,
            inputTokens: recordedUsage.inputTokens,
            outputTokens: finalOut,
            usage: errorUsage,
          };
        }
        continue;
      }

      return {
        ok: false,
        error: errMsg,
        truncated: wasTruncated,
        partialText: genBuf,
        inputTokens: recordedUsage.inputTokens,
        outputTokens: finalOut,
        usage: errorUsage,
      };
    }
  }
}

async function consumeSseStream(response, onEventData) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Normalize CR LF to LF for consistent double-newline event boundary detection
    let normalized = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    let eventBoundary;
    while ((eventBoundary = normalized.indexOf("\n\n")) !== -1) {
      const eventRaw = normalized.slice(0, eventBoundary);
      normalized = normalized.slice(eventBoundary + 2);

      const dataLines = [];
      for (const line of eventRaw.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data:")) {
          dataLines.push(trimmed.slice(5).trim());
        }
      }
      if (dataLines.length > 0) {
        const dataStr = dataLines.join("\n");
        if (dataStr === "[DONE]") return;
        onEventData(dataStr);
      }
    }
    buffer = normalized;
  }

  // Handle any trailing complete event in buffer
  if (buffer.trim()) {
    const dataLines = [];
    for (const line of buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data:")) {
        dataLines.push(trimmed.slice(5).trim());
      }
    }
    if (dataLines.length > 0) {
      const dataStr = dataLines.join("\n");
      if (dataStr && dataStr !== "[DONE]") onEventData(dataStr);
    }
  }
}

async function streamGemini({ apiKey, model, systemPrompt, userPrompt, signal, onDelta, onThinking, onTruncated, onUsage }) {
  const cleanModel = String(model).replace(/^models\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

  // Set BLOCK_NONE across categories so factual legal documents (criminal complaints,
  // FIRs, offences, assault, matrimonial allegations) are not blocked by default filters.
  const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" },
  ];

  // Maximize output token headroom so extensive 30-40 page timelines and exhaustive
  // grounds never truncate prematurely. Gemini 2.x/1.5 support up to 65,536 output tokens.
  const isCap65k = /2\.5|2\.0|1\.5|pro|flash/i.test(cleanModel);
  const maxOutputTokens = isCap65k ? 65536 : 16384;

  const generationConfig = {
    temperature: 0.2,
    maxOutputTokens,
  };

  const body = {
    ...(systemPrompt
      ? { systemInstruction: { parts: [{ text: systemPrompt }] } }
      : {}),
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }],
      },
    ],
    safetySettings,
    generationConfig,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini error (${res.status}): ${extractApiError(errText)}`);
  }

  let lastFinishReason = null;
  let lastBlockReason = null;
  let hasReceivedAnyContent = false;

  await consumeSseStream(res, (dataStr) => {
    try {
      const parsed = JSON.parse(dataStr);
      if (parsed?.promptFeedback?.blockReason) {
        lastBlockReason = parsed.promptFeedback.blockReason;
      }
      if (parsed?.usageMetadata && typeof onUsage === "function") {
        onUsage(parsed.usageMetadata.promptTokenCount, parsed.usageMetadata.candidatesTokenCount);
      }
      const cand = parsed?.candidates?.[0];
      const finishReason = cand?.finishReason;
      if (finishReason) {
        lastFinishReason = finishReason;
        if (finishReason !== "STOP") {
          if (finishReason === "MAX_TOKENS") {
            if (typeof onTruncated === "function") onTruncated();
          } else if (
            finishReason === "SAFETY" ||
            finishReason === "BLOCKLIST" ||
            finishReason === "PROHIBITED_CONTENT" ||
            finishReason === "SPII"
          ) {
            lastBlockReason = finishReason;
            if (typeof onTruncated === "function") onTruncated();
          } else {
            if (typeof onTruncated === "function") onTruncated();
          }
        }
      }
      const parts = cand?.content?.parts;
      if (Array.isArray(parts)) {
        for (const p of parts) {
          if (p.thought) {
            if (typeof onThinking === "function") onThinking();
            continue;
          }
          if (typeof p.text === "string" && p.text) {
            hasReceivedAnyContent = true;
            onDelta(p.text);
          }
        }
      }
    } catch {}
  });

  if (lastBlockReason) {
    if (typeof onTruncated === "function") onTruncated();
    throw new Error(`Gemini stopped generation mid-stream due to content safety policy (${lastBlockReason}). Legal drafting of criminal/matrimonial matters requires unrestricted content filters.`);
  }

  // If content was received but stream never emitted a candidate with "STOP",
  // it was abruptly interrupted (network disconnect / gateway timeout / token cut-off)
  if (hasReceivedAnyContent && lastFinishReason !== "STOP") {
    if (typeof onTruncated === "function") onTruncated();
  }
}

async function streamAnthropic({ apiKey, model, systemPrompt, userPrompt, signal, onDelta, onThinking, onTruncated, onUsage }) {
  const maxTokens = /opus|sonnet|3-7|3-5|4\./i.test(model) ? 64000 : 16384;
  const body = {
    model,
    max_tokens: maxTokens,
    temperature: 0.2,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: [{ role: "user", content: userPrompt }],
    stream: true,
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic error (${res.status}): ${extractApiError(errText)}`);
  }

  await consumeSseStream(res, (dataStr) => {
    try {
      const evt = JSON.parse(dataStr);
      if (evt.type === "message_start" && evt.message?.usage?.input_tokens && typeof onUsage === "function") {
        onUsage(evt.message.usage.input_tokens, 0);
      }
      if (evt.type === "message_delta" && evt.usage?.output_tokens && typeof onUsage === "function") {
        onUsage(undefined, evt.usage.output_tokens);
      }
      if (evt.type === "message_delta" && evt.delta?.stop_reason === "max_tokens") {
        if (typeof onTruncated === "function") onTruncated();
      }
      if (evt.type === "content_block_delta" && evt.delta) {
        if (evt.delta.type === "text_delta" && typeof evt.delta.text === "string") {
          onDelta(evt.delta.text);
        } else if (evt.delta.type === "thinking_delta" && onThinking) {
          onThinking();
        }
      } else if (evt.type === "error" && evt.error) {
        throw new Error(evt.error.message || "Anthropic stream error");
      }
    } catch (e) {
      if (e.message && !/JSON/i.test(e.message)) throw e;
    }
  });
}

async function streamOpenAI({ apiKey, model, systemPrompt, userPrompt, signal, onDelta, onTruncated, onUsage }) {
  const isReasoningModel = /^(o1|o3|o4|gpt-5)/i.test(model);
  const messages = [];
  if (systemPrompt) {
    messages.push({
      role: isReasoningModel ? "developer" : "system",
      content: systemPrompt,
    });
  }
  messages.push({ role: "user", content: userPrompt });

  const body = {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...(isReasoningModel
      ? { max_completion_tokens: 65536 }
      : { temperature: 0.2, max_tokens: 32768 }),
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI error (${res.status}): ${extractApiError(errText)}`);
  }

  await consumeSseStream(res, (dataStr) => {
    try {
      const evt = JSON.parse(dataStr);
      if (evt?.usage && typeof onUsage === "function") {
        onUsage(evt.usage.prompt_tokens, evt.usage.completion_tokens);
      }
      const choice = evt?.choices?.[0];
      if (choice?.finish_reason === "length" && typeof onTruncated === "function") {
        onTruncated();
      }
      const delta = choice?.delta?.content;
      if (typeof delta === "string" && delta) {
        onDelta(delta);
      }
    } catch {}
  });
}

module.exports = {
  DEFAULT_MODELS,
  getKeysStatus,
  saveApiKey,
  fetchProviderModelsFromApi,
  runLlm,
  cancelActiveLlm,
};
