const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const XLSX = require("@e965/xlsx");

const {
  classifyPackPath,
  harmoniseDatasetPack,
} = require("../Services/datasetPackService");

const ELF_ITEM = "To what extent do you agree with the following statements (I have a very good understanding of why I do the things I do.)";
const NPS = "How likely is it that you would recommend the Tasmanian Leader program you have just completed to a friend or colleague?";

test("classifies source families without treating application data as evaluation responses", () => {
  assert.equal(classifyPackPath("ELFs Data/elf2-program-completion-survey.csv").role, "evaluation_raw");
  assert.equal(classifyPackPath("TLP - Data/TLP Program Acceptance Form/tlp-application-form.csv").role, "restricted_administration");
  assert.equal(classifyPackPath("I-LEAD - Data/Completion Surveys/I-LEAD 2020.zip").role, "evaluation_aggregate_archive");
  assert.equal(classifyPackPath("ELFs Data/Names for ELF data.xlsx").role, "restricted_linkage");
});

test("harmonises a real-shaped ELF source without persisting identity or system metadata", async () => {
  const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "kit300-pack-source-"));
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "kit300-pack-output-"));
  try {
    const elfDir = path.join(sourceDir, "ELFs Data");
    const formsDir = path.join(sourceDir, "TLP - Data", "TLP Program Acceptance Form");
    fs.mkdirSync(elfDir, { recursive: true });
    fs.mkdirSync(formsDir, { recursive: true });
    const csv = [
      ["Name (First)", "Name (Last)", ELF_ITEM, NPS, "Created By (User Id)", "User IP"].join(","),
      ["Private", "Person", "Strongly agree", "10 Extremely Likely", "33", "192.0.2.1"].join(","),
    ].join("\n");
    fs.writeFileSync(path.join(elfDir, "elf2-program-completion-survey-2026-07-15.csv"), csv);
    const namesWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      namesWorkbook,
      XLSX.utils.aoa_to_sheet([
        ["I-LEAD YP 2024", ""],
        ["Private", "Person"],
      ]),
      "I-LEAD",
    );
    fs.writeFileSync(
      path.join(elfDir, "Names for ELF data.xlsx"),
      XLSX.write(namesWorkbook, { type: "buffer", bookType: "xlsx" }),
    );
    fs.writeFileSync(
      path.join(formsDir, "tlp-application-form.csv"),
      "Name (First),Email,Medical details\nPrivate,private@example.test,private health data",
    );

    const result = await harmoniseDatasetPack({
      sourceDir,
      outputDir,
      hmacSecret: "pack-test-secret-with-at-least-32-bytes",
      generatedAt: "2026-08-18T00:00:00.000Z",
    });

    assert.equal(result.responses.length, 2);
    assert.deepEqual(
      result.responses.map((record) => record.questionCode).sort(),
      ["ELF_INS_SELF_AWARENESS_01", "PROGRAM_NPS_0_10"],
    );
    assert.ok(result.responses.every((record) => /^[a-f0-9]{64}$/.test(record.personId)));
    assert.ok(result.responses.every((record) => record.program === "I-LEAD"));
    assert.ok(result.responses.every((record) => record.programStream === "I-LEAD YP 2024"));
    assert.ok(result.responses.every((record) => record.cohortYear === "2024"));
    assert.equal(result.datasetCatalog.length, 3);
    assert.equal(
      result.datasetCatalog.find((item) => item.sourceFile.endsWith("tlp-application-form.csv")).status,
      "excluded_restricted",
    );

    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "Private", "Person", "private@example.test", "private health data", "192.0.2.1",
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }

    for (const filename of [
      "master-harmonised.csv",
      "historical-aggregate.csv",
      "dataset-catalog.csv",
      "question-mappings.csv",
      "validation-report.csv",
      "data-dictionary.csv",
      "harmonised-master.sqlite",
      "run-manifest.json",
    ]) {
      assert.equal(fs.existsSync(path.join(outputDir, filename)), true, filename);
    }
    assert.equal(
      fs.readFileSync(path.join(outputDir, "harmonised-master.sqlite")).subarray(0, 16).toString(),
      "SQLite format 3\u0000",
    );
  } finally {
    fs.rmSync(sourceDir, { recursive: true, force: true });
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});
