import { api, ApiError } from "./api";

function response(body, { ok = true, status = 200, contentType = "application/json", disposition = "" } = {}) {
  return {
    ok,
    status,
    headers: {
      get: (name) => name.toLowerCase() === "content-disposition" ? disposition : contentType,
    },
    json: async () => body,
    text: async () => String(body),
    blob: async () => body,
  };
}

afterEach(() => jest.restoreAllMocks());

test("API client unwraps the shared success envelope", async () => {
  global.fetch = jest.fn(async () => response({ success: true, data: [{ id: "run-1" }] }));
  await expect(api.listRuns()).resolves.toEqual([{ id: "run-1" }]);
  expect(global.fetch).toHaveBeenCalledWith("http://localhost:5050/api/runs", {});
});

test("API client surfaces a user-facing structured error", async () => {
  global.fetch = jest.fn(async () => response({ success: false, error: { message: "Invalid dataset" } }, { ok: false, status: 400 }));
  await expect(api.getOverview()).rejects.toEqual(expect.objectContaining({ name: "ApiError", message: "Invalid dataset", status: 400 }));
  expect(new ApiError("Failure", 500)).toBeInstanceOf(Error);
});

test("API client sends JSON mapping decisions and stable export URLs", async () => {
  global.fetch = jest.fn(async () => response({ success: true, data: { id: "run one" } }));
  await api.updateMapping("run one", { sourceQuestion: "Q1", status: "excluded" });
  expect(global.fetch).toHaveBeenCalledWith(
    "http://localhost:5050/api/runs/run%20one/mappings",
    expect.objectContaining({ method: "PATCH", headers: { "content-type": "application/json" } }),
  );
  await api.updateClassification("run one", { sourceColumn: "Q2", classification: "PROGRAM_MEASURE" });
  expect(global.fetch).toHaveBeenCalledWith(
    "http://localhost:5050/api/runs/run%20one/classifications",
    expect.objectContaining({ method: "PATCH", body: JSON.stringify({ sourceColumn: "Q2", classification: "PROGRAM_MEASURE" }) }),
  );
  await api.createRuleVersion("RULE one", { decimals: 2 });
  expect(global.fetch).toHaveBeenCalledWith(
    "http://localhost:5050/api/rules/RULE%20one/versions",
    expect.objectContaining({ method: "POST", body: JSON.stringify({ decimals: 2 }) }),
  );
  expect(api.exportUrl("run one", "run summary")).toBe("http://localhost:5050/api/runs/run%20one/exports/run%20summary");
  expect(api.exportBundleUrl("run one", ["summary", "mappings"])).toBe("http://localhost:5050/api/runs/run%20one/exports/bundle?types=summary%2Cmappings");
});

test("API client downloads an export bundle as a named blob", async () => {
  const blob = new Blob(["zip"], { type: "application/zip" });
  global.fetch = jest.fn(async () => response(blob, {
    contentType: "application/zip",
    disposition: 'attachment; filename="exports.zip"',
  }));
  await expect(api.downloadExportBundle("run one", ["summary", "mappings"])).resolves.toEqual({
    blob,
    filename: "exports.zip",
  });
  expect(global.fetch).toHaveBeenCalledWith("http://localhost:5050/api/runs/run%20one/exports/bundle?types=summary%2Cmappings");
});
