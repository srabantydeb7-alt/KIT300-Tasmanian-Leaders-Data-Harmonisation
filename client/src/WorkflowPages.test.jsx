import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OverviewPage from "./pages/Overview/OverviewPage";
import DatasetsPage from "./pages/Datasets/DatasetsPage";
import MappingPage from "./pages/Mapping/MappingPage";
import RulesPage from "./pages/Rules/RulesPage";
import ValidationPage from "./pages/Validation/ValidationPage";
import ExportPage from "./pages/Export/ExportPage";
import WorkspaceLayout from "./components/WorkspaceLayout";
import { api } from "./api";

const rule = {
  ruleId: "SCALE_1_5_TO_100", name: "1-5 to 0-100", version: "v1", status: "approved",
  transformType: "linear", sourceScale: { min: 1, max: 5 }, targetScale: { min: 0, max: 100 }, decimals: 0,
};

const run = {
  id: "run-1", stage: "exportable", metadata: { program: "Tasmanian Leaders", year: 2026, round: "Round 1", qualityTier: "tier1" },
  source: { originalName: "survey.csv", checksum: "abcdef1234567890abcdef" },
  profile: {
    rowCount: 1,
    questionColumns: ["Confidence", "Influence"],
    identifierColumns: ["Email"],
    unsupportedColumns: [],
    unresolvedClassificationCount: 1,
    fieldClassifications: {
      Email: { classification: "PARTICIPANT_IDENTIFIER", fuzzyEligible: false },
      Confidence: { classification: "ELF_PARTICIPANT_ITEM", fuzzyEligible: true },
      Influence: { classification: "UNCLASSIFIED_QUESTION", fuzzyEligible: true },
    },
    preview: [{ Email: "person@example.com", Confidence: "4" }],
  },
  mappings: [
    { sourceQuestion: "Confidence", targetQuestionCode: "LEAD_CONF", targetQuestion: "Leadership confidence", confidence: 1, mappingLevel: "EXACT", status: "approved", ruleId: rule.ruleId, candidates: [{ code: "LEAD_CONF", label: "Leadership confidence" }] },
    { sourceQuestion: "Influence", targetQuestionCode: "COMMUNITY", targetQuestion: "Community influence", confidence: 0.76, mappingLevel: "SUGGESTION", status: "review", ruleId: rule.ruleId, candidates: [{ code: "COMMUNITY", label: "Community influence" }, { code: "LEAD_CONF", label: "Leadership confidence" }] },
  ],
  records: [{ personId: "pseudonym-123", sourceRow: 2, sourceColumn: "Confidence", originalQuestion: "Confidence", originalValue: "Agree", normalizedResponse: "Agree", originalNumericScore: 6, numericScore: 6, reverseApplied: false, standardizedScore: 83.33, confirmedScale: { min: 1, max: 7, source: "ELF_INSTRUMENT" }, observedRange: { min: 2, max: 6 }, standardisationStatus: "valid", targetQuestionCode: "LEAD_CONF", targetQuestion: "Leadership confidence", harmonisedValue: "Agree", status: "valid", ruleId: rule.ruleId, ruleVersion: "v1" }],
  responseStandardisation: { total: 2, resolvedCount: 1, unresolvedCount: 1, items: [{ sourceQuestion: "Confidence", targetQuestionCode: "LEAD_CONF", confirmedScale: { min: 1, max: 7, source: "ELF_INSTRUMENT" }, observedRange: { min: 2, max: 6 }, reverseScored: false, status: "passed" }, { sourceQuestion: "Influence", targetQuestionCode: "COMMUNITY", confirmedScale: null, observedRange: null, reverseScored: false, status: "review" }] },
  validation: { exportable: true, outcome: "REVIEW_RECOMMENDED", counts: { mustFix: 0, reviewRecommended: 1, passed: 1 }, errors: 0, warnings: 1, validResponses: 1, issues: [{ id: "issue-1", severity: "warning", outcome: "REVIEW_RECOMMENDED", code: "MISSING_VALUE", message: "One response is blank.", location: "row 3, Influence", sourceRow: 3, sourceColumn: "Influence" }] },
  nextAction: { page: "export", label: "Export harmonised data", reason: "All blocking validation checks have passed" },
  workflowProgress: { currentPage: "export", completedCount: 4, steps: [{ page: "datasets", label: "Datasets", status: "complete" }, { page: "mapping", label: "Mapping", status: "complete" }, { page: "rules", label: "Response Standardisation", status: "complete" }, { page: "validation", label: "Validation", status: "complete" }, { page: "export", label: "Export", status: "current" }] },
  elfCoverage: { detectedItems: 2, mappedItems: 1, percent: 50 },
};

const noop = jest.fn();

test("overview presents live run progress", () => {
  render(<OverviewPage overview={{ datasets: 1, questionVariants: 2, warnings: 1, exportable: 1 }} run={run} onDemo={noop} onNavigate={noop} busy={false} />);
  expect(screen.getByText(/50% of question mappings resolved/i)).toBeInTheDocument();
  expect(screen.getByText(/50% ELF coverage/i)).toBeInTheDocument();
  expect(screen.getByText(/all blocking validation checks have passed/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /export harmonised data/i }));
  expect(noop).toHaveBeenCalledWith("export");
});

test("workspace uses server-calculated workflow progress", () => {
  render(<WorkspaceLayout activePage="overview" activeRun={run} runs={[]} busy={false} notice={null} onDismissNotice={noop} onNavigate={noop} onSelectRun={noop}><p>Content</p></WorkspaceLayout>);
  const standardisationStep = screen.getAllByText("Response Standardisation").find((element) => element.classList.contains("workflow-step"));
  const exportStep = screen.getAllByText("Export").find((element) => element.classList.contains("workflow-step"));
  expect(standardisationStep).toHaveClass("workflow-step", "complete");
  expect(exportStep).toHaveClass("workflow-step", "current");
});

test("datasets shows real profile data and a source preview", () => {
  render(<DatasetsPage run={run} runs={[run]} busy={false} onUpload={noop} onDemo={noop} onSelectRun={noop} />);
  expect(screen.getByText("survey.csv")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /preview first 20 rows/i }));
  expect(screen.getByRole("dialog", { name: /first 1 rows/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /close preview/i }));
});

test("datasets explains field classification and lets staff resolve unknown fields", async () => {
  const onSaveClassification = jest.fn(async () => true);
  render(<DatasetsPage run={run} runs={[]} busy={false} onUpload={noop} onDemo={noop} onSelectRun={noop} onSaveClassification={onSaveClassification} />);
  expect(screen.getByText(/1 field needs classification/i)).toBeInTheDocument();
  expect(screen.getByText("Participant identifier")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /treat influence as a program measure/i }));
  await waitFor(() => expect(onSaveClassification).toHaveBeenCalledWith({ sourceColumn: "Influence", classification: "PROGRAM_MEASURE" }));
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
  expect(screen.getByText(/keeps the confirmed 1–7 scale separate from the observed range/i)).toBeInTheDocument();
});

test("mapping requires an explicit human decision", async () => {
  const onSaveMapping = jest.fn(async () => true);
  const alternateRule = { ...rule, ruleId: "SCALE_1_5_TO_7", name: "1-5 to 1-7" };
  render(<MappingPage run={run} rules={[rule, alternateRule]} busy={false} onDemo={noop} onNavigate={noop} onSaveMapping={onSaveMapping} onProcess={noop} />);
  fireEvent.click(screen.getByRole("button", { name: /change mapping for influence/i }));
  expect(screen.getByRole("dialog", { name: /change mapping decision/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: /leadership confidence/i }));
  fireEvent.change(screen.getByRole("combobox", { name: /transformation rule/i }), { target: { value: "SCALE_1_5_TO_7" } });
  fireEvent.click(screen.getByRole("button", { name: /save mapping decision/i }));
  expect(onSaveMapping).toHaveBeenCalledWith(expect.objectContaining({ sourceQuestion: "Influence", status: "approved", ruleId: "SCALE_1_5_TO_7" }));
});

test("mapping shows the formal decision level for reviewable automation", () => {
  render(<MappingPage run={run} rules={[rule]} busy={false} onDemo={noop} onNavigate={noop} onSaveMapping={noop} onProcess={noop} />);
  expect(screen.getByText("Suggestion")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /approve mapping for influence/i })).toBeInTheDocument();
  expect(screen.getByText(/review each source question/i)).toBeInTheDocument();
});

test("mapping warns and allows inferred scoring review items to be approved", () => {
  const onSaveMapping = jest.fn(async () => true);
  const clientOnly = {
    code: "ELF_INS_BALANCED_PROCESSING_03",
    label: "I always solicit views of others before making decisions.",
    defaultRuleId: null,
    scoringStatus: "SCORING_METADATA_REVIEW_REQUIRED",
    sourceStatus: "CLIENT_DATASET_ONLY_NEEDS_FRAMEWORK_SOURCE",
  };
  const elfRule = {
    ...rule,
    ruleId: "ELF_LIKERT_7_CANONICAL",
    name: "Canonical ELF seven-point labels",
    transformType: "categoricalMap",
  };
  const reviewRun = {
    ...run,
    destination: { questions: [clientOnly] },
    mappings: [{
      sourceQuestion: clientOnly.label,
      targetQuestionCode: clientOnly.code,
      targetQuestion: clientOnly.label,
      confidence: 1,
      mappingLevel: "EXACT",
      status: "review",
      ruleId: null,
    }],
  };
  render(<MappingPage run={reviewRun} rules={[rule, elfRule]} busy={false} onDemo={noop} onNavigate={noop} onSaveMapping={onSaveMapping} onProcess={noop} />);
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`change mapping for ${clientOnly.label}`, "i") }));
  expect(screen.getByText(/no source-verified scoring metadata is supplied/i)).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: new RegExp(clientOnly.label, "i") })).not.toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /save mapping decision/i }));
  expect(onSaveMapping).toHaveBeenCalledWith(expect.objectContaining({
    sourceQuestion: clientOnly.label,
    status: "approved",
    ruleId: "ELF_LIKERT_7_CANONICAL",
  }));
});

test("response standardisation shows item-level scales, distributions and scoring evidence", () => {
  render(<RulesPage run={run} rules={[rule]} busy={false} onCreateRule={noop} onCreateRuleVersion={noop} />);
  expect(screen.getByRole("heading", { level: 1, name: /response standardisation/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /item-level response standardisation/i })).toBeInTheDocument();
  expect(screen.getByText("Item 1")).toBeInTheDocument();
  expect(screen.getAllByText(/response-level standardisation/i).length).toBeGreaterThan(0);
  expect(screen.getByText(/1–7 confirmed/i)).toBeInTheDocument();
  expect(screen.getByText(/2–6 observed/i)).toBeInTheDocument();
  expect(screen.getAllByText("83.33").length).toBeGreaterThan(0);
  expect(screen.getAllByRole("columnheader", { name: /original response/i }).length).toBeGreaterThan(0);
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
  expect(screen.getByText("83.33")).toBeInTheDocument();
  expect(screen.getAllByText(/review recommended/i).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: /run validation/i }));
  expect(onProcess).toHaveBeenCalled();
});

test("export remains tied to validation gates and creates a selected ZIP package", async () => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: jest.fn(() => "blob:exports"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: jest.fn(),
  });
  const downloadExportBundle = jest.spyOn(api, "downloadExportBundle").mockResolvedValue({
    blob: new Blob(["zip"], { type: "application/zip" }),
    filename: "run-export-package.zip",
  });
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(<ExportPage run={run} busy={false} onDemo={noop} onNavigate={noop} />);
  expect(screen.getByText(/ready for export/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: /unmapped question report/i }));
  fireEvent.click(screen.getByRole("button", { name: /download selected zip/i }));
  await waitFor(() => expect(downloadExportBundle).toHaveBeenCalledWith(
    "run-1",
    expect.arrayContaining(["destination", "harmonised", "unmapped"]),
  ));
  await waitFor(() => expect(screen.getByText(/files exported as run-export-package.zip/i)).toBeInTheDocument());
  expect(click).toHaveBeenCalled();
  expect(screen.getByRole("link", { name: /save package again/i })).toHaveAttribute("download", "run-export-package.zip");
});
