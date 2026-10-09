// AIMD limiter (explainer section 01): after clean_multiplier x limit clean calls, limit += 1 (up to max);
// on a 503 or 429 the limit halves (min 1). In-flight calls finish; new ones wait.
export function createLimiter({ start, max, cleanMultiplier }) {
  let limit = Math.max(1, start);
  let inFlight = 0;
  let clean = 0;
  const waiters = [];
  const log = [];
  const pump = () => { while (inFlight < limit && waiters.length) { inFlight++; waiters.shift()(); } };
  return {
    get limit() { return limit; },
    get inFlight() { return inFlight; },
    history: log,
    acquire() { return new Promise((res) => { waiters.push(res); pump(); }); },
    release(outcome) {
      inFlight--;
      if (outcome === "clean") {
        clean++;
        if (clean >= cleanMultiplier * limit && limit < max) { limit++; clean = 0; log.push({ t: Date.now(), limit, why: "clean" }); }
      } else if (outcome === "overload") {
        limit = Math.max(1, Math.floor(limit / 2)); clean = 0; log.push({ t: Date.now(), limit, why: "overload" });
      }
      pump();
    },
  };
}
