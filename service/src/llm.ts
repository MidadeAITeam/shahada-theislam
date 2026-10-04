// Thin model clients. Gemini is the default provider for the module; OpenAI is the
// fallback (one setting: LLM_PROVIDER) and also serves the pre-Shahada chat.
import { config } from "./config.ts";

export interface GenOptions {
  model?: string;
  system?: string;
  json?: boolean;
  schema?: unknown; // Gemini responseSchema (OpenAPI subset)
  temperature?: number;
  timeoutMs?: number;
}

export interface Usage { inputTokens: number; outputTokens: number; model: string }

async function post(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(t);
  }
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw last;
}

async function geminiGenerate(prompt: string, o: GenOptions): Promise<{ text: string; usage: Usage }> {
  const model = o.model ?? config.genModel;
  const gc: Record<string, unknown> = { temperature: o.temperature ?? 0.2 };
  if (o.json) gc.responseMimeType = "application/json";
  if (o.schema) gc.responseSchema = o.schema;
  const body: Record<string, unknown> = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: gc };
  if (o.system) body.systemInstruction = { parts: [{ text: o.system }] };
  const d = await withRetry(() =>
    post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { "x-goog-api-key": config.geminiKey }, body, o.timeoutMs ?? 60000),
  );
  const text = (d.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  const u = d.usageMetadata ?? {};
  return { text, usage: { inputTokens: u.promptTokenCount ?? 0, outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0), model } };
}

async function openaiGenerate(prompt: string, o: GenOptions): Promise<{ text: string; usage: Usage }> {
  const model = config.openaiGenModel;
  const body: Record<string, unknown> = { model, input: [...(o.system ? [{ role: "system", content: o.system }] : []), { role: "user", content: prompt }] };
  if (o.json) body.text = { format: { type: "json_object" } };
  const d = await withRetry(() => post("https://api.openai.com/v1/responses", { Authorization: `Bearer ${config.openaiKey}` }, body, o.timeoutMs ?? 60000));
  const text = d.output_text ?? (d.output ?? []).flatMap((x: { content?: { text?: string }[] }) => x.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
  return { text, usage: { inputTokens: d.usage?.input_tokens ?? 0, outputTokens: d.usage?.output_tokens ?? 0, model } };
}

export async function generate(prompt: string, o: GenOptions = {}) {
  return config.provider === "openai" ? openaiGenerate(prompt, o) : geminiGenerate(prompt, o);
}

export async function generateJson<T>(prompt: string, o: GenOptions = {}): Promise<{ data: T; usage: Usage }> {
  const r = await generate(prompt, { ...o, json: true });
  const cleaned = r.text.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  return { data: JSON.parse(cleaned) as T, usage: r.usage };
}

/** Query embedding (same model and size as scripts/build_index.py). */
export async function embedQuery(text: string, dim = 768): Promise<number[]> {
  const d = await withRetry(() =>
    post(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.embedModel}:embedContent`,
      { "x-goog-api-key": config.geminiKey },
      { model: `models/${config.embedModel}`, content: { parts: [{ text }] }, taskType: "RETRIEVAL_QUERY", outputDimensionality: dim },
      20000,
    ),
  );
  return d.embedding.values as number[];
}

// Approximate list prices (USD per 1M tokens) for the cost report; see docs/cost.md.
const PRICES: Record<string, [number, number]> = {
  "gemini-3.8-flash": [0.3, 2.5],
  "gemini-3.5-flash-lite": [0.1, 0.4],
  "gemini-3.1-pro-preview": [2, 12],
};
export function costUsd(u: Usage): number {
  const [i, o] = PRICES[u.model] ?? [0, 0];
  return (u.inputTokens * i + u.outputTokens * o) / 1e6;
}
