export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const DEVELOPMENT_API_URL = import.meta.env.DEV ? "http://localhost:5050" : "";
const BASE_URL = (import.meta.env.VITE_API_URL || DEVELOPMENT_API_URL).replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const contentType = response.headers?.get?.("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok || body?.success === false) {
    throw new ApiError(body?.error?.message || body?.message || `Request failed (${response.status}).`, response.status);
  }
  return body?.data ?? body;
}

function filenameFromDisposition(header, fallback) {
  const match = String(header || "").match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return match ? decodeURIComponent(match[1]) : fallback;
}

async function download(path, fallbackFilename) {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) {
    const contentType = response.headers?.get?.("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();
    throw new ApiError(body?.error?.message || body?.message || `Download failed (${response.status}).`, response.status);
  }
  const blob = await response.blob();
  const filename = filenameFromDisposition(
    response.headers?.get?.("content-disposition"),
    fallbackFilename,
  );
  return { blob, filename };
}

const jsonOptions = (method, body) => ({
  method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

export const api = {
  getOverview: () => request("/api/overview"),
  listRuns: () => request("/api/runs"),
  getRun: (id) => request(`/api/runs/${encodeURIComponent(id)}`),
  createDemoRun: () => request("/api/datasets/demo", { method: "POST" }),
  uploadDataset: (formData) => request("/api/datasets/upload", { method: "POST", body: formData }),
  listRules: () => request("/api/rules"),
  listQuestions: () => request("/api/questions"),
  createRule: (rule) => request("/api/rules", jsonOptions("POST", rule)),
  createRuleVersion: (ruleId, rule) => request(`/api/rules/${encodeURIComponent(ruleId)}/versions`, jsonOptions("POST", rule)),
  updateClassification: (runId, classification) => request(`/api/runs/${encodeURIComponent(runId)}/classifications`, jsonOptions("PATCH", classification)),
  updateMapping: (runId, mapping) => request(`/api/runs/${encodeURIComponent(runId)}/mappings`, jsonOptions("PATCH", mapping)),
  updateHarmonisationTransform: (runId, transform) => request(`/api/runs/${encodeURIComponent(runId)}/harmonisation-transform`, jsonOptions("PATCH", transform)),
  processRun: (runId) => request(`/api/runs/${encodeURIComponent(runId)}/process`, { method: "POST" }),
  exportUrl: (runId, type) => `${BASE_URL}/api/runs/${encodeURIComponent(runId)}/exports/${encodeURIComponent(type)}`,
  exportBundleUrl: (runId, types) => `${BASE_URL}/api/runs/${encodeURIComponent(runId)}/exports/bundle?types=${encodeURIComponent((types || []).join(","))}`,
  downloadExportBundle: (runId, types) => download(
    `/api/runs/${encodeURIComponent(runId)}/exports/bundle?types=${encodeURIComponent((types || []).join(","))}`,
    "harmonisation-export-package.zip",
  ),
};
