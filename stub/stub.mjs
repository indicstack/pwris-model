// Local stub of an OpenAI-compatible streaming server for offline tests.
// The scenario is chosen by the request's model name: ok, slow, hang, stall, runaway, cutoff, empty, badjson, http503, http429, nonstream, flaky-then-ok.
import { createServer } from "node:http";

const sse = (res, obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
const chunk = (text, finish = null, usage) => ({ id: "stub", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: text }, finish_reason: finish }], ...(usage ? { usage } : {}) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms).unref());
const GOOD = JSON.stringify({ files: [{ path: "game/physics.mjs", content: "export const x = 1;\n" }] });

export function startStub(port = 0) {
  const state = { calls: 0, flakyLeft: 2, counts: {} };
  const server = createServer(async (req, res) => {
    let body = ""; for await (const c of req) body += c;
    if (req.url.endsWith("/models")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ data: [{ id: "stub-qwen-3.8-27b", name: "Qwen 3.8 27B", context_length: 4096, pricing: { prompt: "0.000001", completion: "0.000002" } }] })); }
    const req0 = JSON.parse(body);
    const mode = req0.model;
    state.calls++; state.counts[mode] = (state.counts[mode] || 0) + 1;
    if (req0.max_tokens > 65536) { res.writeHead(400, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: { message: `This model's maximum context length is 65536 tokens. However, you requested ${req0.max_tokens + 20} tokens.` } })); }
    if (mode === "http503") { res.writeHead(503); return res.end("upstream unavailable"); }
    if (mode === "http429") { res.writeHead(429, { "retry-after": "0" }); return res.end("your credit balance may be exhausted, or you are sending too fast"); }
    if (mode === "http400") { res.writeHead(400); return res.end("bad request"); }
    if (mode === "flaky") { if (state.flakyLeft-- > 0) { res.writeHead(503); return res.end("flaky"); } }
    if (mode === "nonstream") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ choices: [{ message: { content: GOOD }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } })); }
    if (mode === "hang") { await sleep(60000); return res.end(); }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const usage = { prompt_tokens: 100, completion_tokens: 20 };
    if (mode === "stall") { sse(res, chunk("{\"files\":")); await sleep(60000); return res.end(); }
    if (mode === "slow") { for (const ch of GOOD.match(/.{1,8}/g)) { sse(res, chunk(ch)); await sleep(40); } sse(res, chunk("", "stop", usage)); res.write("data: [DONE]\n\n"); return res.end(); }
    if (mode === "runaway") { for (let i = 0; i < 40; i++) { sse(res, chunk("ab".repeat(50))); await sleep(2); } sse(res, chunk("", "stop", usage)); return res.end(); }
    if (mode === "cutoff") { sse(res, chunk(GOOD.slice(0, 20))); sse(res, chunk("", "length", usage)); res.write("data: [DONE]\n\n"); return res.end(); }
    if (mode === "empty") { sse(res, { choices: [{ index: 0, delta: { reasoning_content: "thinking..." }, finish_reason: null }] }); sse(res, chunk("", "stop", { ...usage, completion_tokens_details: { reasoning_tokens: 20 } })); return res.end(); }
    if (mode === "badjson") { sse(res, chunk("{\"files\": [oops")); sse(res, chunk("", "stop", usage)); return res.end(); }
    // ok, flaky (after failures), anything else
    const text = req0.messages.some((m) => /\[fix /.test(m.content)) ? GOOD : GOOD;
    sse(res, chunk(text)); sse(res, chunk("", "stop", usage)); res.write("data: [DONE]\n\n"); res.end();
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, state, port: server.address().port, baseUrl: `http://127.0.0.1:${server.address().port}/v1` })));
}

if (process.argv[1] && process.argv[1].endsWith("stub.mjs")) startStub(Number(process.argv[2] || 3901)).then((s) => console.log(`stub on ${s.baseUrl}`));
