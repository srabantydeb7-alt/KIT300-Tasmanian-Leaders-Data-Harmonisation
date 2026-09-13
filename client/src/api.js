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
  updateMapping: (runId, mapping) => request(`/api/runs/${encodeURIComponent(runId)}/mappings`, jsonOptions("PATCH", mapping)),
  processRun: (runId) => request(`/api/runs/${encodeURIComponent(runId)}/process`, { method: "POST" }),
  exportUrl: (runId, type) => `${BASE_URL}/api/runs/${encodeURIComponent(runId)}/exports/${encodeURIComponent(type)}`,
};
