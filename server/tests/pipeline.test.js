const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normaliseQuestion,
  suggestMappings,
} = require("../Services/mappingService");
const { profileRows } = require("../Services/profileService");
const {
  applyTransformation,
  harmoniseRows,
} = require("../Services/transformationService");
const { validateRun } = require("../Services/validationService");

const targetQuestions = [
  {
    code: "LEAD_CONF",
    label: "Leadership confidence",
    aliases: ["How confident are you as a leader?"],
  },
  {
    code: "NETWORKS",
    label: "Professional networks",
    aliases: ["The program built my network"],
  },
];

test("normalises harmless wording differences deterministically", () => {
  assert.equal(
    normaliseQuestion("  How CONFIDENT are you as a leader?! "),
    "how confident are you as a leader",
  );
});

test("profiles identifiers, missing values, and numeric response scales", () => {
  const rows = [
    { Email: "a@example.com", Name: "Ada", Confidence: "1", Network: "5" },
    { Email: "b@example.com", Name: "Ben", Confidence: "3", Network: "" },
    { Email: "c@example.com", Name: "Cy", Confidence: "5", Network: "4" },
  ];

  const profile = profileRows(rows);

  assert.equal(profile.rowCount, 3);
  assert.deepEqual(profile.identifierColumns, ["Email", "Name"]);
  assert.equal(profile.columns.Confidence.kind, "number");
  assert.deepEqual(profile.columns.Confidence.detectedScale, { min: 1, max: 5 });
  assert.equal(profile.columns.Network.missingCount, 1);
  assert.deepEqual(profile.questionColumns, ["Confidence", "Network"]);
});

test("uses approved aliases first and keeps fuzzy matches advisory", () => {
  const [exact, fuzzy, unknown] = suggestMappings(
    [
      "How confident are you as a leader?",
      "The programme helped build my professional network",
      "Favourite lunch option",
    ],
    targetQuestions,
  );

  assert.equal(exact.targetQuestionCode, "LEAD_CONF");
  assert.equal(exact.method, "alias");
  assert.equal(exact.status, "approved");
  assert.equal(exact.confidence, 1);

  assert.equal(fuzzy.targetQuestionCode, "NETWORKS");
  assert.equal(fuzzy.method, "similarity");
  assert.notEqual(fuzzy.status, "approved");

  assert.equal(unknown.status, "unmapped");
  assert.equal(unknown.targetQuestionCode, null);
});

test("requires review when exact wording exceeds the destination scale", () => {
  const profile = profileRows([
    { "Leadership confidence": "1" },
    { "Leadership confidence": "7" },
  ]);
  const [mapping] = suggestMappings(
    ["Leadership confidence"],
    [{
      code: "DST_CONFIDENCE",
      label: "Leadership confidence",
      aliases: ["Leadership confidence"],
      expectedKind: "number",
      targetScale: { min: 1, max: 5 },
      defaultRuleId: "VALUE_IDENTITY",
    }],
    profile,
  );
  assert.equal(mapping.confidence, 1);
  assert.equal(mapping.status, "review");
  assert.equal(mapping.method, "exact_scale_review");
});

test("applies typed linear, reverse, and categorical transformations without eval", () => {
  const linearRule = {
    transformType: "linear",
    sourceScale: { min: 1, max: 5 },
    targetScale: { min: 0, max: 100 },
    decimals: 0,
  };

  assert.equal(applyTransformation("4", linearRule).value, 75);
  assert.equal(
    applyTransformation("2", { ...linearRule, transformType: "reverse" }).value,
    75,
  );
  assert.equal(
    applyTransformation("Yes", {
      transformType: "categoricalMap",
      valueMap: { Yes: 1, No: 0 },
    }).value,
    1,
  );
  assert.equal(applyTransformation("", linearRule).status, "missing");
  assert.equal(applyTransformation("7", linearRule).status, "out_of_range");
});

test("creates traceable long-form records and never exports raw identifiers", () => {
  const result = harmoniseRows({
    runId: "run-1",
    rows: [
      {
        Email: "ada@example.com",
        "How confident are you as a leader?": "4",
      },
    ],
    identifierColumns: ["Email"],
    mappings: [
      {
        sourceQuestion: "How confident are you as a leader?",
        targetQuestionCode: "LEAD_CONF",
        targetQuestion: "Leadership confidence",
        status: "approved",
        ruleId: "SCALE_1_5_TO_100",
      },
    ],
    rules: [
      {
        ruleId: "SCALE_1_5_TO_100",
        version: "v1",
        status: "approved",
        transformType: "linear",
        sourceScale: { min: 1, max: 5 },
        targetScale: { min: 0, max: 100 },
        decimals: 0,
      },
    ],
    hashIdentifier: () => "pseudonym-123",
  });

  assert.equal(result.records.length, 1);
  assert.deepEqual(result.records[0], {
    runId: "run-1",
    personId: "pseudonym-123",
    sourceRow: 2,
    sourceColumn: "How confident are you as a leader?",
    originalQuestion: "How confident are you as a leader?",
    originalValue: "4",
    targetQuestionCode: "LEAD_CONF",
    targetQuestion: "Leadership confidence",
    harmonisedValue: 75,
    status: "valid",
    ruleId: "SCALE_1_5_TO_100",
    ruleVersion: "v1",
  });
  assert.equal(JSON.stringify(result).includes("ada@example.com"), false);
});

test("uses the rule version pinned to a mapping instead of a newer library version", () => {
  const result = harmoniseRows({
    runId: "run-pinned",
    rows: [{ Email: "ada@example.com", Confidence: "4" }],
    identifierColumns: ["Email"],
    mappings: [
      {
        sourceQuestion: "Confidence",
        targetQuestionCode: "LEAD_CONF",
        targetQuestion: "Leadership confidence",
        status: "approved",
        ruleId: "SCALE_RULE",
        ruleVersion: "v1",
      },
    ],
    rules: [
      {
        ruleId: "SCALE_RULE",
        version: "v1",
        transformType: "linear",
        sourceScale: { min: 1, max: 5 },
        targetScale: { min: 0, max: 100 },
        decimals: 0,
      },
      {
        ruleId: "SCALE_RULE",
        version: "v2",
        transformType: "linear",
        sourceScale: { min: 1, max: 5 },
        targetScale: { min: 0, max: 10 },
        decimals: 1,
      },
    ],
    hashIdentifier: () => "person",
  });
  assert.equal(result.records[0].harmonisedValue, 75);
  assert.equal(result.records[0].ruleVersion, "v1");
});

test("validation locates blocking mapping/range issues and allows warnings", () => {
  const validation = validateRun({
    identifierColumns: [],
    mappings: [
      { sourceQuestion: "Unknown header", status: "unmapped" },
    ],
    records: [
      {
        sourceRow: 4,
        sourceColumn: "Confidence",
        status: "out_of_range",
        originalValue: "9",
      },
      {
        sourceRow: 5,
        sourceColumn: "Confidence",
        status: "missing",
        originalValue: "",
      },
    ],
    duplicateCount: 0,
  });

  assert.equal(validation.exportable, false);
  assert.ok(validation.issues.some((issue) => issue.code === "MISSING_IDENTIFIER"));
  assert.ok(validation.issues.some((issue) => issue.code === "UNMAPPED_QUESTION"));
  assert.ok(
    validation.issues.some(
      (issue) => issue.code === "OUT_OF_RANGE" && issue.location === "row 4, Confidence",
    ),
  );
  assert.ok(validation.issues.some((issue) => issue.severity === "warning"));
});
