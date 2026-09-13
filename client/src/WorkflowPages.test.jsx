import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OverviewPage from "./pages/Overview/OverviewPage";
import DatasetsPage from "./pages/Datasets/DatasetsPage";
import MappingPage from "./pages/Mapping/MappingPage";
import RulesPage from "./pages/Rules/RulesPage";
import ValidationPage from "./pages/Validation/ValidationPage";
import ExportPage from "./pages/Export/ExportPage";

const rule = {
  ruleId: "SCALE_1_5_TO_100", name: "1-5 to 0-100", version: "v1", status: "approved",
  transformType: "linear", sourceScale: { min: 1, max: 5 }, targetScale: { min: 0, max: 100 }, decimals: 0,
};

const run = {
  id: "run-1", stage: "exportable", metadata: { program: "Tasmanian Leaders", year: 2026, round: "Round 1", qualityTier: "tier1" },
  source: { originalName: "survey.csv", checksum: "abcdef1234567890abcdef" },
  profile: { rowCount: 1, questionColumns: ["Confidence", "Influence"], identifierColumns: ["Email"], unsupportedColumns: [], preview: [{ Email: "person@example.com", Confidence: "4" }] },
  mappings: [
    { sourceQuestion: "Confidence", targetQuestionCode: "LEAD_CONF", targetQuestion: "Leadership confidence", confidence: 1, status: "approved", ruleId: rule.ruleId, candidates: [{ code: "LEAD_CONF", label: "Leadership confidence" }] },
    { sourceQuestion: "Influence", targetQuestionCode: "COMMUNITY", targetQuestion: "Community influence", confidence: 0.76, status: "review", ruleId: rule.ruleId, candidates: [{ code: "COMMUNITY", label: "Community influence" }, { code: "LEAD_CONF", label: "Leadership confidence" }] },
  ],
  records: [{ personId: "pseudonym-123", sourceRow: 2, sourceColumn: "Confidence", originalQuestion: "Confidence", originalValue: "4", targetQuestionCode: "LEAD_CONF", targetQuestion: "Leadership confidence", harmonisedValue: 75, status: "valid", ruleId: rule.ruleId, ruleVersion: "v1" }],
  validation: { exportable: true, counts: { valid: 1, warnings: 1, errors: 0 }, issues: [{ id: "issue-1", severity: "warning", code: "MISSING_VALUE", message: "One response is blank.", location: "row 3, Influence", sourceRow: 3, sourceColumn: "Influence" }] },
};

const noop = jest.fn();

test("overview presents live run progress", () => {
  render(<OverviewPage overview={{ datasets: 1, questionVariants: 2, warnings: 1, exportable: 1 }} run={run} onDemo={noop} onNavigate={noop} busy={false} />);
  expect(screen.getByText(/50% of question mappings resolved/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /continue this run/i }));
  expect(noop).toHaveBeenCalled();
});

test("datasets shows real profile data and a source preview", () => {
  render(<DatasetsPage run={run} runs={[run]} busy={false} onUpload={noop} onDemo={noop} onSelectRun={noop} />);
  expect(screen.getByText("survey.csv")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /preview first 20 rows/i }));
  expect(screen.getByRole("dialog", { name: /first 1 rows/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /close preview/i }));
});

test("datasets uploads the selected file with metadata and resumes saved work", async () => {
  const onUpload = jest.fn(async () => true);
  const onSelectRun = jest.fn();
  render(<DatasetsPage run={run} runs={[run]} busy={false} onUpload={onUpload} onDemo={noop} onSelectRun={onSelectRun} />);
  const file = new File(["Email,Confidence\na@example.com,4"], "new-survey.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText(/choose survey file/i), { target: { files: [file] } });
  const destination = new File(
    ["Respondent ID,Confidence\np-1,1\np-2,5"],
    "future-framework.csv",
    { type: "text/csv" },
  );
  fireEvent.change(screen.getByLabelText(/choose optional destination/i), {
    target: { files: [destination] },
  });
  fireEvent.click(screen.getByRole("button", { name: /upload and profile/i }));
  await waitFor(() => expect(onUpload).toHaveBeenCalledWith(expect.any(FormData)));
  const submitted = onUpload.mock.calls[0][0];
  expect(submitted.get("dataset").name).toBe("new-survey.csv");
  expect(submitted.get("destination").name).toBe("future-framework.csv");
  fireEvent.click(screen.getByRole("button", { name: "Resume" }));
  expect(onSelectRun).toHaveBeenCalledWith("run-1");
});

test("datasets explains the built-in ELF destination when no custom file is chosen", () => {
  render(<DatasetsPage run={run} runs={[]} busy={false} onUpload={noop} onDemo={noop} onSelectRun={noop} />);
  expect(screen.getByText(/tasmanian leaders elf 2024 destination template/i)).toBeInTheDocument();
  expect(screen.getByText(/does not invent a numeric elf score/i)).toBeInTheDocument();
});

test("mapping requires an explicit human decision", async () => {
  const onSaveMapping = jest.fn(async () => true);
  const alternateRule = { ...rule, ruleId: "SCALE_1_5_TO_7", name: "1-5 to 1-7" };
  render(<MappingPage run={run} rules={[rule, alternateRule]} busy={false} onDemo={noop} onNavigate={noop} onSaveMapping={onSaveMapping} onProcess={noop} />);
  fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
  fireEvent.click(screen.getByRole("radio", { name: /leadership confidence/i }));
  fireEvent.change(screen.getByRole("combobox", { name: /transformation rule/i }), { target: { value: "SCALE_1_5_TO_7" } });
  fireEvent.click(screen.getByRole("button", { name: /save mapping decision/i }));
  expect(onSaveMapping).toHaveBeenCalledWith(expect.objectContaining({ sourceQuestion: "Influence", status: "approved", ruleId: "SCALE_1_5_TO_7" }));
});

test("rule steward can create a typed transformation", async () => {
  const onCreateRule = jest.fn(async () => true);
  render(<RulesPage rules={[rule]} busy={false} onCreateRule={onCreateRule} onCreateRuleVersion={noop} />);
  fireEvent.click(screen.getByRole("button", { name: /add rule/i }));
  fireEvent.change(screen.getByLabelText(/rule id/i), { target: { value: "scale_1_5_to_7" } });
  fireEvent.change(screen.getByLabelText(/rule name/i), { target: { value: "1-5 to 1-7" } });
  fireEvent.click(screen.getByRole("button", { name: /save rule version/i }));
  await waitFor(() => expect(onCreateRule).toHaveBeenCalledWith(expect.objectContaining({ ruleId: "SCALE_1_5_TO_7", transformType: "linear" })));
});

test("rule steward can create a typed categorical map without executable code", async () => {
  const onCreateRule = jest.fn(async () => true);
  render(<RulesPage rules={[rule]} busy={false} onCreateRule={onCreateRule} onCreateRuleVersion={noop} />);
  fireEvent.click(screen.getByRole("button", { name: /add rule/i }));
  fireEvent.change(screen.getByLabelText(/rule id/i), { target: { value: "yes_no_map" } });
  fireEvent.change(screen.getByLabelText(/rule name/i), { target: { value: "Yes and no map" } });
  fireEvent.change(screen.getByLabelText(/transformation/i), { target: { value: "categoricalMap" } });
  fireEvent.change(screen.getByLabelText(/category mappings/i), { target: { value: "Yes=1\nNo=0\nUnknown=review" } });
  fireEvent.click(screen.getByRole("button", { name: /save rule version/i }));
  await waitFor(() => expect(onCreateRule).toHaveBeenCalledWith(expect.objectContaining({
    ruleId: "YES_NO_MAP",
    transformType: "categoricalMap",
    valueMap: { Yes: 1, No: 0, Unknown: "review" },
  })));
});

test("rule steward can create an immutable version of an existing rule", async () => {
  const onCreateRuleVersion = jest.fn(async () => true);
  render(<RulesPage rules={[rule]} busy={false} onCreateRule={noop} onCreateRuleVersion={onCreateRuleVersion} />);
  fireEvent.click(screen.getByRole("button", { name: /create new version/i }));
  fireEvent.change(screen.getByLabelText(/decimal places/i), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: /save rule version/i }));
  await waitFor(() => expect(onCreateRuleVersion).toHaveBeenCalledWith(
    "SCALE_1_5_TO_100",
    expect.objectContaining({ ruleId: "SCALE_1_5_TO_100", decimals: 2 }),
  ));
});

test("validation exposes located issues and before-after evidence", () => {
  const onProcess = jest.fn();
  render(<ValidationPage run={run} busy={false} onDemo={noop} onNavigate={noop} onProcess={onProcess} />);
  expect(screen.getByText("row 3, Influence")).toBeInTheDocument();
  fireEvent.click(screen.getByText("row 3, Influence"));
  expect(screen.getByText("75")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /run validation/i }));
  expect(onProcess).toHaveBeenCalled();
});

test("export remains tied to validation gates", () => {
  jest.useFakeTimers();
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(<ExportPage run={run} busy={false} onDemo={noop} onNavigate={noop} />);
  expect(screen.getByText(/ready for export/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: /unmapped question report/i }));
  fireEvent.click(screen.getByRole("button", { name: /download selected/i }));
  jest.runAllTimers();
  expect(click).toHaveBeenCalled();
  click.mockRestore();
  jest.useRealTimers();
});
