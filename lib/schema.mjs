// The worker's only output shape. Strict JSON schema as the explainer's request shape requires.
export const FILES_SCHEMA = {
  name: "files_out",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["files"],
    properties: {
      files: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["path", "content"],
          properties: { path: { type: "string" }, content: { type: "string" } },
        },
      },
    },
  },
};

// Returns { ok, files | error }. Never repairs JSON.
export function parseFiles(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { return { ok: false, error: `JSON.parse: ${e.message}` }; }
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.files) || obj.files.length === 0) return { ok: false, error: "missing non-empty files array" };
  for (const f of obj.files) {
    if (!f || typeof f.path !== "string" || typeof f.content !== "string") return { ok: false, error: "each file needs string path and content" };
    const extra = Object.keys(f).filter((k) => k !== "path" && k !== "content");
    if (extra.length) return { ok: false, error: `unexpected keys ${extra.join(",")}` };
  }
  return { ok: true, files: obj.files };
}
