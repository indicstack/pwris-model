import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startStub } from "../stub/stub.mjs";
import { chatStream, totalTimeoutMs } from "../lib/client.mjs";
import { createLimiter } from "../lib/limiter.mjs";
import { parseFiles } from "../lib/schema.mjs";

let stub;
before(async () => { stub = await startStub(0); });
after(() => { stub.server.closeAllConnections(); stub.server.close(); });
const call = (model, over = {}) => chatStream({ baseUrl: stub.baseUrl, apiKey: "test-key", body: { model, max_tokens: 100, messages: [{ role: "user", content: "x" }] }, firstTokenTimeoutMs: 500, stallTimeoutMs: 500, totalTimeoutMs: 5000, runawayTail: 100, runawayRepeats: 4, ...over });

test("ok: streams, parses, usage present", async () => { const r = await call("ok"); assert.equal(r.kind, "ok"); assert.ok(parseFiles(r.text).ok); assert.equal(r.usage.completion_tokens, 20); assert.ok(r.ttft >= 0); });
test("slow: completes, gaps measured", async () => { const r = await call("slow"); assert.equal(r.kind, "ok"); assert.ok(r.maxGap > 0.02); });
test("hang: first_token_timeout", async () => { const r = await call("hang"); assert.equal(r.kind, "first_token_timeout"); });
test("stall: stall after first chunk", async () => { const r = await call("stall"); assert.equal(r.kind, "stall"); });
test("total_timeout wins when the stream is slow and the total clock is short", async () => { const r = await call("slow", { totalTimeoutMs: 100, stallTimeoutMs: 5000 }); assert.equal(r.kind, "total_timeout"); });
test("runaway: repeated tail stops the stream", async () => { const r = await call("runaway"); assert.equal(r.kind, "runaway"); });
test("cutoff: finish_reason length", async () => { const r = await call("cutoff"); assert.equal(r.kind, "length"); });
test("empty: reasoning only -> empty_content", async () => { const r = await call("empty"); assert.equal(r.kind, "empty_content"); assert.ok(r.reasoningChars > 0); });
test("badjson: kind ok but parseFiles fails (worker maps to bad_json)", async () => { const r = await call("badjson"); assert.equal(r.kind, "ok"); assert.equal(parseFiles(r.text).ok, false); });
test("503 -> http_5xx", async () => { const r = await call("http503"); assert.equal(r.kind, "http_5xx"); assert.equal(r.status, 503); });
test("429 -> kind 429 with retry-after", async () => { const r = await call("http429"); assert.equal(r.kind, "429"); assert.equal(r.retryAfter, 0); });
test("400 -> http_error with body", async () => { const r = await call("http400"); assert.equal(r.kind, "http_error"); assert.match(r.error, /bad request/); });
test("non-streaming body is accepted", async () => { const r = await call("nonstream"); assert.equal(r.kind, "ok"); assert.ok(parseFiles(r.text).ok); });
test("network error -> network", async () => { const r = await chatStream({ baseUrl: "http://127.0.0.1:1/v1", apiKey: "k", body: {}, firstTokenTimeoutMs: 500, stallTimeoutMs: 500, totalTimeoutMs: 1000, runawayTail: 100, runawayRepeats: 4 }); assert.equal(r.kind, "network"); });
test("ladder: oversize max_tokens returns the window in the error text", async () => { const r = await call("ok", { body: { model: "ok", max_tokens: 131072, messages: [] } }); assert.equal(r.kind, "http_error"); assert.match(r.error, /65536/); });
test("schema: parseFiles rejects extras and empties", () => { assert.equal(parseFiles('{"files":[]}').ok, false); assert.equal(parseFiles('{"files":[{"path":"a","content":"b","x":1}]}').ok, false); assert.equal(parseFiles('{"files":[{"path":"a","content":"b"}]}').ok, true); });
test("limiter: AIMD grows after clean calls and halves on overload", async () => {
  const l = createLimiter({ start: 2, max: 4, cleanMultiplier: 2 });
  for (let i = 0; i < 4; i++) { await l.acquire(); l.release("clean"); }
  assert.equal(l.limit, 3);
  await l.acquire(); l.release("overload");
  assert.equal(l.limit, 1);
  let started = 0; const p1 = l.acquire().then(() => started++); const p2 = l.acquire().then(() => started++);
  await p1; await new Promise((r) => setTimeout(r, 10)); assert.equal(started, 1, "second waits while limit is 1"); l.release("clean"); await p2; assert.equal(started, 2); l.release("clean");
});
test("total timeout formula from the explainer", () => { assert.equal(totalTimeoutMs({ maxTokens: 1200, speedTps: 12, margin: 1.25, firstTokenS: 60, extraS: 30 }), 215000); });
