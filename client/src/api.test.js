import { api, ApiError } from "./api";

function response(body, { ok = true, status = 200, contentType = "application/json" } = {}) {
  return { ok, status, headers: { get: () => contentType }, json: async () => body, text: async () => String(body) };
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
  await api.createRuleVersion("RULE one", { decimals: 2 });
  expect(global.fetch).toHaveBeenCalledWith(
    "http://localhost:5050/api/rules/RULE%20one/versions",
    expect.objectContaining({ method: "POST", body: JSON.stringify({ decimals: 2 }) }),
  );
  expect(api.exportUrl("run one", "run summary")).toBe("http://localhost:5050/api/runs/run%20one/exports/run%20summary");
});
