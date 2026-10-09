// Streaming chat client with three clocks (first token, stall, total) and a runaway stop.
// Returns exactly one outcome kind per call. Never logs headers or the key.
export const KINDS = ["ok", "length", "empty_content", "bad_json", "runaway", "first_token_timeout", "stall", "total_timeout", "http_5xx", "network", "429", "http_error"];

function tailRepeated(text, tail, repeats) {
  if (text.length < tail * repeats) return false;
  const last = text.slice(-tail);
  for (let i = 2; i <= repeats; i++) {
    if (text.slice(-tail * i, -tail * (i - 1)) !== last) return false;
  }
  return true;
}

export async function chatStream({ baseUrl, apiKey, body, firstTokenTimeoutMs, stallTimeoutMs, totalTimeoutMs, runawayTail, runawayRepeats, extraHeaders = {} }) {
  const t0 = performance.now();
  const ctrl = new AbortController();
  let timedOutAs = null;
  let timer = null;
  const arm = (kind, ms) => { clearTimeout(timer); timer = setTimeout(() => { timedOutAs = kind; ctrl.abort(); }, ms); };
  const totalTimer = setTimeout(() => { timedOutAs = "total_timeout"; ctrl.abort(); }, totalTimeoutMs);
  const result = { kind: null, text: "", reasoningChars: 0, usage: null, finishReason: null, status: null, seconds: 0, ttft: null, maxGap: 0, error: null, retryAfter: null, raw: null, provider: null, servedModel: null };
  const finish = (kind, extra = {}) => { clearTimeout(timer); clearTimeout(totalTimer); result.kind = kind; result.seconds = (performance.now() - t0) / 1000; Object.assign(result, extra); return result; };

  let res;
  try {
    arm("first_token_timeout", firstTokenTimeoutMs);
    res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, ...extraHeaders },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (timedOutAs) return finish(timedOutAs, { error: `aborted: ${timedOutAs}` });
    return finish("network", { error: String(e?.cause?.code || e?.message || e) });
  }
  result.status = res.status;
  if (res.status === 429) {
    const ra = res.headers.get("retry-after");
    const text = await res.text().catch(() => "");
    return finish("429", { retryAfter: ra ? Number(ra) : null, error: text.slice(0, 500) });
  }
  if ([502, 503, 504].includes(res.status)) {
    const text = await res.text().catch(() => "");
    return finish("http_5xx", { error: text.slice(0, 500) });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return finish("http_error", { error: text.slice(0, 2000) });
  }

  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("text/event-stream")) {
    // Non-streaming reply (some gateways ignore stream:true). Treat the body as one chunk.
    let json;
    try { json = await res.json(); } catch (e) { return finish("bad_json", { error: `non-stream body: ${e.message}` }); }
    const ch = json.choices?.[0];
    result.text = ch?.message?.content || "";
    result.reasoningChars = (ch?.message?.reasoning_content || ch?.message?.reasoning || "").length;
    result.finishReason = ch?.finish_reason || null;
    result.usage = json.usage || null;
    result.provider = json.provider || null; result.servedModel = json.model || null;
    result.ttft = (performance.now() - t0) / 1000;
    result.raw = json;
    return classify(finish(null));
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let lastChunkAt = null;
  let sawFirst = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const now = performance.now();
      if (!sawFirst) { sawFirst = true; result.ttft = (now - t0) / 1000; }
      else result.maxGap = Math.max(result.maxGap, (now - lastChunkAt) / 1000);
      lastChunkAt = now;
      arm("stall", stallTimeoutMs);
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let ev;
        try { ev = JSON.parse(data); } catch { continue; }
        if (ev.usage) result.usage = ev.usage;
        if (ev.provider) result.provider = ev.provider;
        if (ev.model) result.servedModel = ev.model;
        const ch = ev.choices?.[0];
        if (!ch) continue;
        const d = ch.delta || {};
        if (typeof d.content === "string") result.text += d.content;
        const r = d.reasoning_content ?? d.reasoning;
        if (typeof r === "string") result.reasoningChars += r.length;
        if (ch.finish_reason) result.finishReason = ch.finish_reason;
        if (tailRepeated(result.text, runawayTail, runawayRepeats)) {
          clearTimeout(timer); clearTimeout(totalTimer);
          try { await reader.cancel(); } catch {}
          return finish("runaway", { error: `last ${runawayTail} chars repeated ${runawayRepeats}x` });
        }
      }
    }
  } catch (e) {
    if (timedOutAs) return finish(timedOutAs, { error: `aborted: ${timedOutAs}` });
    return finish("network", { error: `stream: ${e?.message || e}` });
  }
  if (timedOutAs) return finish(timedOutAs, { error: `aborted: ${timedOutAs}` });
  return classify(finish(null));
}

function classify(r) {
  if (r.finishReason === "length") { r.kind = "length"; return r; }
  if (!r.text.trim()) { r.kind = "empty_content"; return r; }
  r.kind = "ok";
  return r;
}

// Timeout budget from the explainer: answer budget / speed x margin + first-token limit + extra.
export function totalTimeoutMs({ maxTokens, speedTps, margin, firstTokenS, extraS }) {
  return Math.round(((maxTokens / speedTps) * margin + firstTokenS + extraS) * 1000);
}

export function tokensEstimate(chars, charsPerToken) { return Math.ceil(chars / charsPerToken); }
