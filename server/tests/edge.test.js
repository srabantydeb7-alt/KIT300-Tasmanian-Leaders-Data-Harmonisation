const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const XLSX = require("@e965/xlsx");

const { createApp, getOrCreateHmacSecret } = require("../app");
const { JsonStore } = require("../Store/jsonStore");
const {
  createCsv,
  protectSpreadsheetCell,
  summaryPdf,
} = require("../Services/exportService");
const {
  DatasetParseError,
  parseDatasetBuffer,
} = require("../Services/fileParser");
const { suggestMapping, tokenSimilarity } = require("../Services/mappingService");
const { profileRows } = require("../Services/profileService");
const { validateRuleInput, WorkflowError } = require("../Services/runService");
const { applyTransformation } = require("../Services/transformationService");
const { validateRun } = require("../Services/validationService");

async function withServer(callback) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kit300-edge-"));
  const server = createApp({
    dataDir,
    hmacSecret: "edge-test-secret-with-at-least-32-bytes",
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`, dataDir);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

function workbookBuffer(bookType) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Email", "How confident are you as a leader?"],
    ["ada@example.com", 5],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Survey");
  return XLSX.write(workbook, { type: "buffer", bookType });
}

test("secure parser accepts values-only XLS and XLSX workbooks", () => {
  for (const extension of ["xls", "xlsx"]) {
    const parsed = parseDatasetBuffer(workbookBuffer(extension), `survey.${extension}`);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].Email, "ada@example.com");
    assert.equal(parsed.worksheetName, "Survey");
  }
});

test("secure parser rejects empty, disguised, binary and unsafe-header files", () => {
  const cases = [
    [Buffer.alloc(0), "empty.csv", /empty/],
    [Buffer.from("not a workbook"), "fake.xlsx", /valid XLSX/],
    [Buffer.from("not a workbook"), "fake.xls", /valid XLS/],
    [Buffer.from([65, 0, 66]), "binary.csv", /binary/],
    [Buffer.from([0xc3, 0x28]), "encoding.csv", /UTF-8/],
    [Buffer.from("__proto__,Question\na,1"), "unsafe.csv", /not supported/],
    [Buffer.from("Email,email\na@b.test,a@b.test"), "duplicate.csv", /duplicate header/],
  ];
  for (const [buffer, filename, message] of cases) {
    assert.throws(() => parseDatasetBuffer(buffer, filename), message);
  }
  assert.throws(
    () => parseDatasetBuffer(Buffer.from("a"), "survey.txt"),
    DatasetParseError,
  );
});

test("secure parser rejects formulas and excessive cell content", () => {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([["Email", "Score"], ["a@b.test", 1]]);
  worksheet.B2 = { t: "n", f: "1+1", v: 2 };
  XLSX.utils.book_append_sheet(workbook, worksheet, "Survey");
  const formulaBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  assert.throws(
    () => parseDatasetBuffer(formulaBuffer, "formula.xlsx"),
    /Formula cells/,
  );
  assert.throws(
    () => parseDatasetBuffer(Buffer.from(`Email,Comment\na@b.test,${"x".repeat(32_001)}`), "long.csv"),
    /character limit/,
  );
});

test("secure parser enforces header and column boundaries", () => {
  assert.throws(() => parseDatasetBuffer(Buffer.from(",Question\na,1"), "blank.csv"), /no header/);
  assert.throws(
    () => parseDatasetBuffer(Buffer.from(`${"h".repeat(251)}\na`), "header.csv"),
    /excessively long/,
  );
  const headers = Array.from({ length: 501 }, (_, index) => `Q${index}`).join(",");
  assert.throws(
    () => parseDatasetBuffer(Buffer.from(`${headers}\n${headers}`), "wide.csv"),
    /500 columns/,
  );
  assert.throws(
    () => parseDatasetBuffer(Buffer.from("PK-invalid-zip"), "broken.xlsx"),
    /valid XLSX/,
  );
});

test("profiling covers boolean, date, empty and duplicate identifier fields without samples", () => {
  const profile = profileRows([
    { Email: "same@example.com", Consent: "Yes", Date: "2026-08-18", Empty: "" },
    { Email: "same@example.com", Consent: "No", Date: "2026-08-19", Empty: "" },
  ]);
  assert.equal(profile.columns.Consent.kind, "boolean");
  assert.equal(profile.columns.Date.kind, "date");
  assert.equal(profile.columns.Empty.kind, "empty");
  assert.equal(profile.duplicateCount, 1);
  assert.deepEqual(profile.columns.Email.sampleValues, []);
});

test("profiling classifies non-standard email and phone columns as identifiers", () => {
  const profile = profileRows([
    {
      "Preferred contact": "analyst@example.com",
      Mobile: "+61 412 345 678",
      "How confident are you as a leader?": "4",
    },
    {
      "Preferred contact": "N/A",
      Mobile: "not supplied",
      "How confident are you as a leader?": "5",
    },
  ]);
  assert.deepEqual(profile.identifierColumns, ["Preferred contact", "Mobile"]);
  assert.deepEqual(profile.questionColumns, ["How confident are you as a leader?"]);
  assert.deepEqual(profile.columns["Preferred contact"].sampleValues, []);
  assert.deepEqual(profile.columns.Mobile.sampleValues, []);
});

test("profiling separates Gravity Forms identity, restricted, and system columns from questions", () => {
  const question = "I have a very good understanding of why I do the things I do.";
  const profile = profileRows([
    {
      "Name (First)": "Private",
      "Name (Last)": "Person",
      "Residential address": "Private address",
      "Medical details": "Private health information",
      Employer: "Private organisation",
      "Created By (User Id)": "41",
      "Entry Id": "99",
      "User IP": "192.0.2.1",
      "Source Url": "https://example.invalid/private",
      [question]: "Agree",
    },
  ]);

  assert.deepEqual(profile.identifierColumns, ["Name (First)", "Name (Last)"]);
  assert.deepEqual(
    profile.sensitiveColumns,
    ["Residential address", "Medical details", "Employer"],
  );
  assert.deepEqual(
    profile.metadataColumns,
    ["Created By (User Id)", "Entry Id", "User IP", "Source Url"],
  );
  assert.deepEqual(profile.questionColumns, [question]);
  for (const column of [
    ...profile.identifierColumns,
    ...profile.sensitiveColumns,
    ...profile.metadataColumns,
  ]) {
    assert.deepEqual(profile.columns[column].sampleValues, []);
  }
});

test("mapping and transformation helpers cover exact, low-confidence and invalid values", () => {
  const targets = [{ code: "ONE", label: "Leadership confidence", aliases: [] }];
  assert.equal(suggestMapping("Leadership confidence", targets).method, "exact");
  assert.equal(suggestMapping("Favourite lunch", targets).status, "unmapped");
  assert.equal(tokenSimilarity("", "anything"), 0);
  assert.equal(applyTransformation("text", null).status, "missing_rule");
  assert.equal(
    applyTransformation("Maybe", { transformType: "categoricalMap", valueMap: { Yes: 1 } }).status,
    "unmapped_value",
  );
  assert.equal(
    applyTransformation("word", {
      transformType: "linear",
      sourceScale: { min: 1, max: 5 },
      targetScale: { min: 0, max: 100 },
    }).status,
    "invalid_type",
  );
  assert.deepEqual(applyTransformation("plain text", { transformType: "identity" }), {
    value: "plain text",
    status: "valid",
  });
});

test("validation reports every blocking conversion status and duplicate warnings", () => {
  const validation = validateRun({
    identifierColumns: ["Email"],
    mappings: [{ sourceQuestion: "Question", targetQuestionCode: "Q", status: "review" }],
    records: ["missing_rule", "invalid_type", "unmapped_value"].map((status, index) => ({
      sourceRow: index + 2,
      sourceColumn: "Question",
      status,
    })),
    duplicateCount: 2,
  });
  assert.equal(validation.exportable, false);
  assert.equal(validation.warnings, 1);
  assert.ok(validation.issues.some((item) => item.code === "MAPPING_REQUIRES_REVIEW"));
  assert.ok(validation.issues.some((item) => item.code === "MISSING_RULE"));
  assert.ok(validation.issues.some((item) => item.code === "INVALID_VALUE"));
  assert.ok(validation.issues.some((item) => item.code === "UNMAPPED_VALUE"));
  assert.ok(validation.issues.some((item) => item.code === "DUPLICATE_IDENTIFIER"));
});

test("exports quote CSV safely and produce a valid minimal PDF with sparse metadata", () => {
  assert.equal(protectSpreadsheetCell(null), "");
  assert.equal(protectSpreadsheetCell(4), "4");
  assert.equal(protectSpreadsheetCell(true), "true");
  assert.equal(protectSpreadsheetCell("=2+2"), "'=2+2");
  assert.equal(protectSpreadsheetCell("safe\u0000value"), "safevalue");
  const csv = createCsv(
    [{ key: "value", label: "Value" }],
    [{ value: 'comma, quote " and\nnewline' }],
  );
  assert.match(csv, /"comma, quote "" and/);
  const pdf = summaryPdf({ id: "run-min", stage: "mapping" });
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.match(pdf.toString("ascii"), /Not processed/);
});

test("HMAC secret generation persists safely and accepts an explicit override", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kit300-secret-"));
  try {
    const supplied = "supplied-secret-with-at-least-32-bytes";
    assert.equal(getOrCreateHmacSecret(dataDir, supplied), supplied);
    assert.throws(() => getOrCreateHmacSecret(dataDir, "weak"), /at least 32 bytes/);
    const created = getOrCreateHmacSecret(dataDir);
    assert.equal(created.length, 64);
    assert.equal(getOrCreateHmacSecret(dataDir), created);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("persistent stores add new built-in ELF definitions without replacing user rules", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kit300-migrate-"));
  try {
    fs.writeFileSync(
      path.join(dataDir, "harmonisation-store.json"),
      JSON.stringify({
        schemaVersion: 1,
        runs: [],
        rules: [{
          ruleId: "USER_RULE",
          version: "v1",
          name: "User-defined rule",
          transformType: "identity",
          status: "approved",
        }],
        targetQuestions: [{
          code: "LEAD_CONF",
          label: "Leadership confidence",
          aliases: ["My approved local wording"],
          defaultRuleId: "USER_RULE",
        }],
      }),
    );
    const state = new JsonStore(dataDir).read();
    assert.ok(state.rules.some((rule) => rule.ruleId === "USER_RULE"));
    assert.ok(state.rules.some((rule) => rule.ruleId === "ELF_LIKERT_7_CANONICAL"));
    assert.ok(state.targetQuestions.some((question) => question.code === "ELF_INS_SELF_AWARENESS_01"));
    const existing = state.targetQuestions.find((question) => question.code === "LEAD_CONF");
    assert.equal(existing.defaultRuleId, "USER_RULE");
    assert.ok(existing.aliases.includes("My approved local wording"));
    assert.ok(existing.aliases.includes("How confident are you as a leader?"));
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("production app serves built client routes without shadowing API 404s", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kit300-spa-data-"));
  const clientBuildDir = fs.mkdtempSync(path.join(os.tmpdir(), "kit300-spa-build-"));
  fs.writeFileSync(path.join(clientBuildDir, "index.html"), "<main>Harmonisation app</main>");
  const server = createApp({
    dataDir,
    clientBuildDir,
    hmacSecret: "spa-test-secret-with-at-least-32-bytes",
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const spa = await fetch(`${baseUrl}/mapping/run-1`);
    assert.equal(spa.status, 200);
    assert.match(await spa.text(), /Harmonisation app/);
    const api = await fetch(`${baseUrl}/api/not-real`);
    assert.equal(api.status, 404);
    assert.match(api.headers.get("content-type"), /application\/json/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(clientBuildDir, { recursive: true, force: true });
  }
});

test("rule validation rejects executable and malformed rule definitions", () => {
  const invalidRules = [
    {},
    { ruleId: "bad-id", name: "Bad", transformType: "identity" },
    { ruleId: "CUSTOM_RULE", name: "Custom", transformType: "custom" },
    { ruleId: "LINEAR_RULE", name: "Linear", transformType: "linear" },
    { ruleId: "MAP_RULE", name: "Map", transformType: "categoricalMap", valueMap: {} },
  ];
  invalidRules.forEach((rule) => assert.throws(() => validateRuleInput(rule), WorkflowError));
});

test("API reports validation blocks and JSON errors with the stable envelope", async () => {
  await withServer(async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/health`)).status, 200);
    const questions = await (await fetch(`${baseUrl}/api/questions`)).json();
    assert.ok(questions.data.length > 0);

    const emptyForm = new FormData();
    const emptyUpload = await fetch(`${baseUrl}/api/datasets/upload`, {
      method: "POST",
      body: emptyForm,
    });
    assert.equal(emptyUpload.status, 400);

    const disguisedForm = new FormData();
    disguisedForm.append("dataset", new Blob(["not xlsx"]), "fake.xlsx");
    const disguised = await fetch(`${baseUrl}/api/datasets/upload`, {
      method: "POST",
      body: disguisedForm,
    });
    assert.equal(disguised.status, 400);

    const form = new FormData();
    form.append("dataset", new Blob(["Question\n9"]), "unidentified.csv");
    const uploaded = await fetch(`${baseUrl}/api/datasets/upload`, { method: "POST", body: form });
    const upload = await uploaded.json();
    assert.equal(uploaded.status, 201);

    const process = await fetch(`${baseUrl}/api/runs/${upload.data.id}/process`, { method: "POST" });
    const processed = await process.json();
    assert.equal(processed.data.stage, "validation");
    assert.equal(processed.data.validation.exportable, false);

    const blocked = await fetch(`${baseUrl}/api/runs/${upload.data.id}/exports/harmonised`);
    assert.equal(blocked.status, 409);
    assert.equal((await blocked.json()).success, false);

    const missing = await fetch(`${baseUrl}/api/runs/not-a-run`);
    assert.equal(missing.status, 404);
    const missingProcess = await fetch(`${baseUrl}/api/runs/not-a-run/process`, { method: "POST" });
    assert.equal(missingProcess.status, 404);
    const missingExport = await fetch(`${baseUrl}/api/runs/${upload.data.id}/exports/unknown`);
    assert.equal(missingExport.status, 404);

    const badJson = await fetch(`${baseUrl}/api/rules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{bad",
    });
    assert.equal(badJson.status, 400);
    assert.deepEqual(Object.keys(await badJson.json()).sort(), ["error", "success"]);
  });
});

test("API never persists or exports identifiers from non-standard contact columns", async () => {
  await withServer(async (baseUrl, dataDir) => {
    const csv = [
      "Preferred contact,Mobile,Medical details,Created By (User Id),User IP,How confident are you as a leader?",
      "private.person@example.com,+61 412 345 678,private health details,44,192.0.2.44,4",
      "N/A,not supplied,private health details,45,192.0.2.45,5",
    ].join("\n");
    const form = new FormData();
    form.append("dataset", new Blob([csv]), "contacts.csv");
    const uploadResponse = await fetch(`${baseUrl}/api/datasets/upload`, {
      method: "POST",
      body: form,
    });
    const upload = await uploadResponse.json();
    assert.equal(uploadResponse.status, 201);
    assert.deepEqual(upload.data.profile.identifierColumns, ["Preferred contact", "Mobile"]);
    assert.deepEqual(upload.data.profile.sensitiveColumns, ["Medical details"]);
    assert.deepEqual(
      upload.data.profile.metadataColumns,
      ["Created By (User Id)", "User IP"],
    );
    assert.equal(JSON.stringify(upload).includes("private.person@example.com"), false);
    assert.equal(JSON.stringify(upload).includes("412 345 678"), false);
    assert.equal(JSON.stringify(upload).includes("private health details"), false);
    assert.equal(JSON.stringify(upload).includes("192.0.2.44"), false);

    const persisted = fs.readFileSync(path.join(dataDir, "harmonisation-store.json"), "utf8");
    assert.equal(persisted.includes("private.person@example.com"), false);
    assert.equal(persisted.includes("412 345 678"), false);
    assert.equal(persisted.includes("private health details"), false);
    assert.equal(persisted.includes("192.0.2.44"), false);

    await fetch(`${baseUrl}/api/runs/${upload.data.id}/process`, { method: "POST" });
    const exportResponse = await fetch(
      `${baseUrl}/api/runs/${upload.data.id}/exports/harmonised`,
    );
    const exported = await exportResponse.text();
    assert.equal(exportResponse.status, 200);
    assert.equal(exported.includes("private.person@example.com"), false);
    assert.equal(exported.includes("412 345 678"), false);
    assert.equal(exported.includes("private health details"), false);
    assert.equal(exported.includes("192.0.2.44"), false);
  });
});

test("API validates rule and mapping mutations", async () => {
  await withServer(async (baseUrl) => {
    const invalidRule = await fetch(`${baseUrl}/api/rules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ruleId: "CUSTOM", name: "Unsafe", transformType: "custom" }),
    });
    assert.equal(invalidRule.status, 400);

    const validRuleBody = {
      ruleId: "YES_NO_LOCAL",
      name: "Local Yes No",
      transformType: "categoricalMap",
      valueMap: { Yes: 1, No: 0 },
      status: "approved",
    };
    const validRule = await fetch(`${baseUrl}/api/rules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validRuleBody),
    });
    assert.equal(validRule.status, 201);
    const duplicateRule = await fetch(`${baseUrl}/api/rules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validRuleBody),
    });
    assert.equal(duplicateRule.status, 409);
    const draftVersion = await fetch(`${baseUrl}/api/rules/YES_NO_LOCAL/versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "draft" }),
    });
    assert.equal(draftVersion.status, 201);

    const draftRule = await fetch(`${baseUrl}/api/rules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ruleId: "DRAFT_LINEAR",
        name: "Draft linear rule",
        transformType: "linear",
        sourceScale: { min: 1, max: 5 },
        targetScale: { min: 0, max: 100 },
        status: "draft",
      }),
    });
    assert.equal(draftRule.status, 201);

    const missingRule = await fetch(`${baseUrl}/api/rules/NO_RULE/versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(missingRule.status, 404);

    const form = new FormData();
    form.append("dataset", new Blob(["Email,Unknown question\na@b.test,4"]), "unknown.csv");
    const upload = await (await fetch(`${baseUrl}/api/datasets/upload`, {
      method: "POST",
      body: form,
    })).json();

    const draftMapping = await fetch(`${baseUrl}/api/runs/${upload.data.id}/mappings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceQuestion: "Unknown question",
        targetQuestionCode: "LEAD_CONF",
        status: "approved",
        ruleId: "DRAFT_LINEAR",
      }),
    });
    assert.equal(draftMapping.status, 400);

    const approvedVersionMapping = await fetch(`${baseUrl}/api/runs/${upload.data.id}/mappings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceQuestion: "Unknown question",
        targetQuestionCode: "LEAD_CONF",
        status: "approved",
        ruleId: "YES_NO_LOCAL",
      }),
    });
    assert.equal(approvedVersionMapping.status, 200);
    const approvedMappingBody = await approvedVersionMapping.json();
    assert.equal(approvedMappingBody.data.mappings[0].ruleVersion, "v1");

    const invalidMapping = await fetch(`${baseUrl}/api/runs/${upload.data.id}/mappings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceQuestion: "Unknown question", status: "approved" }),
    });
    assert.equal(invalidMapping.status, 400);

    const missingMapping = await fetch(`${baseUrl}/api/runs/${upload.data.id}/mappings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceQuestion: "Not present", status: "excluded" }),
    });
    assert.equal(missingMapping.status, 404);

    const excluded = await fetch(`${baseUrl}/api/runs/${upload.data.id}/mappings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceQuestion: "Unknown question", status: "excluded" }),
    });
    assert.equal(excluded.status, 200);
    assert.equal((await excluded.json()).data.stage, "ready_to_process");
  });
});
