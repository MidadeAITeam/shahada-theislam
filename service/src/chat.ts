// Pre-Shahada da'wah chat for the demo tenant: the platform's own role (OpenAI), streamed in the
// same SSE shape the theislam.chat frontend already reads. The only behavioural change is the
// <shahada/> signal that opens the module (see content/prompts/dawah.md).
import fs from "node:fs";
import path from "node:path";
import type { FastifyReply } from "fastify";
import { config, ROOT } from "./config.ts";

const PROMPT = fs.readFileSync(path.join(ROOT, "content/prompts/dawah.md"), "utf8").replace(/<!--[\s\S]*?-->/g, "");

function splitSuggestions(text: string) {
  const m = text.match(/<suggested_questions>([\s\S]*?)<\/suggested_questions>/);
  let suggested: string[] = [];
  if (m) {
    try {
      suggested = JSON.parse(m[1]);
    } catch {
      /* ignore malformed suggestions */
    }
  }
  return suggested;
}

export async function streamChat(body: { text: string; previous_response_id?: string | null; lang?: string }, reply: FastifyReply) {
  reply.raw.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  const send = (o: unknown) => reply.raw.write(`data: ${JSON.stringify(o)}\n\n`);
  const req: Record<string, unknown> = {
    model: config.chatModel,
    instructions: PROMPT,
    input: [{ role: "user", content: body.text }],
    stream: true,
    store: true,
    reasoning: { effort: "low" },
  };
  if (body.previous_response_id) req.previous_response_id = body.previous_response_id;
  let text = "";
  let responseId = "";
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.openaiKey}` },
      body: JSON.stringify(req),
    });
    if (!res.ok || !res.body) throw new Error(`openai ${res.status} ${(await res.text()).slice(0, 200)}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const evt = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = evt.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const d = JSON.parse(line.slice(5));
        if (d.type === "response.created") responseId = d.response.id;
        if (d.type === "response.output_text.delta") {
          text += d.delta;
          send({ text: text.replace(/<suggested_questions>[\s\S]*/, "").replace("<shahada/>", "").trimEnd(), final: false });
        }
      }
    }
    const shahada = text.includes("<shahada/>");
    const clean = text.replace(/<suggested_questions>[\s\S]*/, "").replace("<shahada/>", "").trimEnd();
    send({ text: clean + (shahada ? "\n<shahada/>" : ""), final: true, response_id: responseId, suggested_questions: splitSuggestions(text), shahada, title: body.text.slice(0, 60) });
  } catch (e) {
    send({ text: text || "Sorry, something went wrong. Please try again.", final: true, error: String(e).slice(0, 200) });
  }
  reply.raw.end();
}
