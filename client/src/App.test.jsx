import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

beforeEach(() => {
  global.fetch = jest.fn(async (url) => {
    const path = String(url);

    if (path.includes("/api/overview")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: { datasets: 0, questionVariants: 0, warnings: 0, exportable: 0 },
        }),
      };
    }

    return {
      ok: true,
      json: async () => ({ success: true, data: [] }),
    };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("renders the complete harmonisation workflow navigation", async () => {
  render(<App />);

  expect(await screen.findByRole("heading", { name: /survey harmonisation workbench/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /datasets/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /mapping/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /scale rules/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /validation/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /export/i })).toBeInTheDocument();
});

test("moves between workflow pages without losing the active workspace", async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: /scale rules/i }));
  expect(screen.getByRole("heading", { name: /scale conversion rules/i })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /validation/i }));
  expect(screen.getByRole("heading", { name: /validation and traceability/i })).toBeInTheDocument();
});

test("offers a sanitised demonstration run when no dataset is active", async () => {
  render(<App />);

  expect(await screen.findByRole("button", { name: /load demonstration run/i })).toBeInTheDocument();
});

test("automatically restores the most recently updated saved run", async () => {
  const summary = {
    id: "latest-run",
    stage: "exportable",
    metadata: { program: "Latest programme", year: 2026 },
    source: { originalName: "latest.csv" },
    updatedAt: "2026-08-18T00:00:00.000Z",
  };
  global.fetch = jest.fn(async (url) => {
    const path = String(url);
    const data = path.endsWith("/api/runs")
      ? [summary]
      : path.endsWith("/api/runs/latest-run")
        ? { ...summary, profile: {}, mappings: [], records: [], validation: { exportable: true, issues: [] } }
        : path.endsWith("/api/overview")
          ? { totalRuns: 1, readyForExport: 1 }
          : [];
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ success: true, data }),
    };
  });

  render(<App />);

  expect(await screen.findByRole("combobox", { name: /resume saved workspace/i })).toHaveValue("latest-run");
  expect(global.fetch).toHaveBeenCalledWith("http://localhost:5050/api/runs/latest-run", {});
});

test("completes a live demo mapping, processing, rule, and resume workflow", async () => {
  let activeRun = null;
  let savedRules = [];
  const workflowRun = {
    id: "demo-run",
    stage: "needs_review",
    metadata: { program: "Tasmanian Leaders", year: 2026, qualityTier: "tier1" },
    source: { originalName: "demo.csv", checksum: "abcdef1234567890" },
    profile: { rowCount: 1, questionColumns: ["Confidence", "Influence"], identifierColumns: ["Email"], preview: [{ Email: "a@example.com", Confidence: 4 }] },
    mappings: [
      { sourceQuestion: "Confidence", targetQuestionCode: "LEAD_CONF", targetQuestion: "Leadership confidence", confidence: 1, status: "approved", candidates: [{ code: "LEAD_CONF", label: "Leadership confidence" }] },
      { sourceQuestion: "Influence", targetQuestionCode: "COMMUNITY", targetQuestion: "Community influence", confidence: 0.75, status: "review", candidates: [{ code: "COMMUNITY", label: "Community influence" }] },
    ],
    records: [],
  };
  const result = (data, status = 200) => ({ ok: status < 400, status, headers: { get: () => "application/json" }, json: async () => ({ success: status < 400, data }), text: async () => "" });
  global.fetch = jest.fn(async (url, options = {}) => {
    const path = String(url);
    if (path.endsWith("/api/overview")) return result({ uniqueDatasets: activeRun ? 1 : 0, normalisedQuestionVariants: activeRun ? 2 : 0, activeValidationWarnings: 0, readyForExport: activeRun?.stage === "exportable" ? 1 : 0 });
    if (path.endsWith("/api/datasets/demo")) { activeRun = JSON.parse(JSON.stringify(workflowRun)); return result(activeRun, 201); }
    if (path.endsWith("/api/runs") && (!options.method || options.method === "GET")) return result(activeRun ? [activeRun] : []);
    if (path.endsWith("/api/rules") && options.method === "POST") { const created = { ...JSON.parse(options.body), version: "v1" }; savedRules.push(created); return result(created, 201); }
    if (path.endsWith("/api/rules")) return result([...savedRules]);
    if (path.endsWith("/mappings")) { const update = JSON.parse(options.body); activeRun = { ...activeRun, mappings: activeRun.mappings.map((mapping) => mapping.sourceQuestion === update.sourceQuestion ? { ...mapping, ...update } : mapping), stage: "ready" }; return result(activeRun); }
    if (path.endsWith("/process")) { activeRun = { ...activeRun, stage: "exportable", records: [{ personId: "pseudo", sourceRow: 2, originalQuestion: "Confidence", originalValue: "4", targetQuestionCode: "LEAD_CONF", harmonisedValue: 75, status: "valid", ruleVersion: "v1" }], validation: { exportable: true, issues: [], counts: { valid: 1, warnings: 0, errors: 0 } } }; return result(activeRun); }
    if (path.includes("/api/runs/demo-run")) return result(activeRun);
    return result([]);
  });

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /load demonstration run/i }));
  expect(await screen.findByRole("heading", { name: /question mapping review/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
  fireEvent.click(screen.getByRole("button", { name: /save mapping decision/i }));
  await screen.findByText(/100% resolved/i);
  fireEvent.click(screen.getByRole("button", { name: /run harmonisation/i }));
  expect(await screen.findByRole("heading", { name: /validation and traceability/i })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /scale rules/i }));
  fireEvent.click(await screen.findByRole("button", { name: /add rule/i }));
  fireEvent.change(screen.getByLabelText(/rule id/i), { target: { value: "scale_test" } });
  fireEvent.change(screen.getByLabelText(/rule name/i), { target: { value: "Test rule" } });
  fireEvent.click(screen.getByRole("button", { name: /save rule version/i }));
  expect((await screen.findAllByText(/test rule/i)).length).toBeGreaterThan(0);

  fireEvent.change(screen.getByLabelText(/resume saved workspace/i), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText(/resume saved workspace/i), { target: { value: "demo-run" } });
  expect(await screen.findByText(/saved workspace restored/i)).toBeInTheDocument();
});
