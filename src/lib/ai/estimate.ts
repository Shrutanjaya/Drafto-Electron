// ── Rough task-time estimate ─────────────────────────────────────────────────
// A deliberately approximate "how long might this take" figure, based on how
// much context must be processed, how much output the task implies, and the
// model's speed. Presented as a single ~N value; it is a guide, not a promise.

export type Effort = "small" | "medium" | "large";

// Very rough tokens/sec figures (prefill = input processing, out = generation).
const PREFILL: Record<string, number> = { haiku: 9000, sonnet: 4500, opus: 2800 };
const OUTRATE: Record<string, number> = { haiku: 110, sonnet: 65, opus: 45 };
const OUT_TOKENS: Record<Effort, number> = { small: 700, medium: 2500, large: 6000 };

function modelKey(model: string): "haiku" | "sonnet" | "opus" {
  return model === "haiku" || model === "opus" ? model : "sonnet";
}

// Returns seconds (mid estimate).
export function estimateSeconds(contextTokens: number, effort: Effort, model: string): number {
  const m = modelKey(model);
  const prefill = Math.max(0, contextTokens) / PREFILL[m];
  const gen = OUT_TOKENS[effort] / OUTRATE[m];
  return prefill + gen + 12; // + fixed overhead (startup, tool calls)
}

// A human-friendly rough label, e.g. "~30s", "~2 min".
export function estimateLabel(contextTokens: number, effort: Effort, model: string): string {
  const s = estimateSeconds(contextTokens, effort, model);
  if (s < 45) return "~30s";
  if (s < 90) return "~1 min";
  return `~${Math.round(s / 60)} min`;
}

export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}
