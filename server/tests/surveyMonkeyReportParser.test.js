const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("@e965/xlsx");

const {
  LIMITS,
  SurveyMonkeyReportError,
  detectSurveyMonkeyAggregateReport,
  parseSurveyMonkeyReportBuffer,
  parseSurveyMonkeyReportMatrix,
} = require("../Services/surveyMonkeyReportParser");

const simpleAndNpsMatrix = [
  ["Synthetic SurveyMonkey report"],
  ["Q1. I consent to aggregate evaluation"],
  ["Answer Choices", "Responses", ""],
  ["Yes", "75.00%", "3"],
  ["No", "25.00%", "1"],
  ["", "Answered", "4"],
  ["", "Skipped", "1"],
  [],
  ["Q2. How likely are you to recommend the program?"],
  [
    "Detractors (0-6)",
    "",
    "Passive (7-8)",
    "",
    "Promoters (9-10)",
    "",
    "Net Promoter Score",
  ],
  ["10.00%", "1", "20.00%", "2", "70.00%", "7", "60"],
  ["", "", "", "", "", "Answered", "10"],
  ["", "", "", "", "", "Skipped", "0"],
];

test("parses choice and NPS question blocks into canonical aggregate records", () => {
  assert.equal(detectSurveyMonkeyAggregateReport(simpleAndNpsMatrix), true);
  const result = parseSurveyMonkeyReportMatrix(simpleAndNpsMatrix, {
    sourceName: "synthetic-summary.csv",
  });

  assert.equal(result.format, "surveymonkey-aggregate-report");
  assert.equal(result.records.length, 5);
  assert.deepEqual(result.records[0], {
    questionCode: "Q1",
    questionText: "I consent to aggregate evaluation",
    sectionText: "I consent to aggregate evaluation",
    responseOption: "Yes",
    responseCount: 3,
    responsePercent: 75,
    answered: 4,
    skipped: 1,
    nps: null,
    weightedAverage: null,
    sourceRow: 4,
  });
  assert.deepEqual(
    result.records.slice(2).map((record) => ({
      option: record.responseOption,
      count: record.responseCount,
      percent: record.responsePercent,
      nps: record.nps,
    })),
    [
      { option: "Detractors (0-6)", count: 1, percent: 10, nps: 60 },
      { option: "Passive (7-8)", count: 2, percent: 20, nps: 60 },
      { option: "Promoters (9-10)", count: 7, percent: 70, nps: 60 },
    ],
  );
  assert.deepEqual(result.questions.map((question) => question.questionCode), ["Q1", "Q2"]);
});

test("parses real SurveyMonkey response-percent, count-only NPS and count-only matrix layouts", () => {
  const matrix = [
    ["Real-shaped aggregate export"],
    ["Q1. Consent"],
    ["Answer Choices", "Response Percent", "Responses"],
    ["Yes", "75%", "3"],
    ["No", "25%", "1"],
    ["If yes, please tell us more", "", "2"],
    ["", "Answered", "4"],
    ["", "Skipped", "0"],
    [],
    ["Q2. How likely are you to recommend the program?"],
    ["Detractors (0-6)", "Passive (7-8)", "Promoters (9-10)", "Net Promoter Score"],
    ["1", "2", "7", "60"],
    ["", "", "Answered", "10"],
    ["", "", "Skipped", "0"],
    [],
    ["Q3. Satisfaction"],
    ["Answer Choices", "Very unsatisfied", "Neutral", "Very satisfied", "Total", "Weighted Average"],
    ["1", "1", "2", "7", "10", "2.6"],
    ["Please add a comment", "", "", "", "5", ""],
    ["", "", "", "", "Answered", "10"],
    ["", "", "", "", "Skipped", "0"],
  ];

  const result = parseSurveyMonkeyReportMatrix(matrix, { sourceName: "real-layout.csv" });
  assert.equal(result.records.length, 8);
  assert.deepEqual(
    result.records.filter((record) => record.questionCode === "Q2").map((record) => [
      record.responseOption, record.responseCount, record.responsePercent, record.nps,
    ]),
    [
      ["Detractors (0-6)", 1, 10, 60],
      ["Passive (7-8)", 2, 20, 60],
      ["Promoters (9-10)", 7, 70, 60],
    ],
  );
  const satisfaction = result.records.filter((record) => record.questionCode === "Q3");
  assert.equal(satisfaction.length, 3);
  assert.deepEqual(
    satisfaction.map((record) => [record.responseCount, record.responsePercent]),
    [[1, 10], [2, 20], [7, 70]],
  );
  assert.equal(JSON.stringify(result).includes("Please add a comment"), false);
});

test("parses matrix question blocks and attaches total, skipped and weighted average", () => {
  const matrix = [
    ["Synthetic matrix report"],
    ["Q4. Leadership Skills: Personal"],
    ["", "Disagree", "", "Neutral", "", "Agree", "", "Total", "Weighted Average"],
    ["I understand others.", "10%", "2", "20%", "4", "70%", "14", "20", "2.6"],
    ["I am more confident.", "5%", "1", "15%", "3", "80%", "16", "20", "2.75"],
    ["", "", "", "", "", "", "", "Answered", "20"],
    ["", "", "", "", "", "", "", "Skipped", "2"],
    [],
    ["Q5. Overall satisfaction"],
    ["", "Unsatisfied", "", "Neutral", "", "Satisfied", "", "Total", "Weighted Average"],
    ["1", "5%", "1", "20%", "4", "75%", "15", "20", "2.7"],
    ["", "", "", "", "", "", "", "Answered", "20"],
    ["", "", "", "", "", "", "", "Skipped", "2"],
  ];

  const result = parseSurveyMonkeyReportMatrix(matrix, { sourceName: "matrix.xlsx" });
  assert.equal(result.records.length, 9);
  const first = result.records[0];
  assert.equal(first.questionCode, "Q4");
  assert.equal(first.sectionText, "Leadership Skills: Personal");
  assert.equal(first.questionText, "I understand others.");
  assert.equal(first.responseOption, "Disagree");
  assert.equal(first.answered, 20);
  assert.equal(first.skipped, 2);
  assert.equal(first.weightedAverage, 2.6);

  const satisfaction = result.records.find(
    (record) => record.questionCode === "Q5" && record.responseOption === "Satisfied",
  );
  assert.equal(satisfaction.questionText, "Overall satisfaction");
  assert.equal(satisfaction.responseCount, 15);
  assert.equal(satisfaction.responsePercent, 75);
});

test("buffer API parses CSV and XLSX values-only reports", () => {
  const csv = simpleAndNpsMatrix
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const csvResult = parseSurveyMonkeyReportBuffer(Buffer.from(csv), {
    sourceName: "legacy-report.csv",
  });
  assert.equal(csvResult.records.length, 5);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(simpleAndNpsMatrix),
    "Report",
  );
  const xlsx = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const xlsxResult = parseSurveyMonkeyReportBuffer(xlsx, {
    sourceName: "legacy-report.xlsx",
  });
  assert.equal(xlsxResult.records.length, 5);
});

test("rejects Q*_Text attachments and renamed respondent-level free-text exports", () => {
  assert.throws(
    () =>
      parseSurveyMonkeyReportBuffer(Buffer.from("Respondent ID,Response Date,Comment\n1,today,private"), {
        sourceName: "Q14_Text.csv",
      }),
    /free-text attachment/i,
  );
  assert.throws(
    () =>
      parseSurveyMonkeyReportMatrix(
        [["Respondent ID", "Response Date", "Please add comments"], ["123", "today", "private"]],
        { sourceName: "renamed.csv" },
      ),
    /respondent-level free-text/i,
  );
});

test("ignores embedded respondent comment tables in an otherwise valid aggregate report", () => {
  const privateComment = "private respondent comment that must never be emitted";
  const matrix = [
    ["Survey"],
    ["Q1. Program value"],
    ["Answer Choices", "Responses", ""],
    ["High", "100%", "2"],
    ["", "Answered", "2"],
    ["", "Skipped", "0"],
    ["Respondent ID", "Response Date", "Please add comments", "Tags"],
    ["123", "today", privateComment, ""],
  ];
  const result = parseSurveyMonkeyReportMatrix(matrix, { sourceName: "main-report.xlsx" });
  assert.equal(result.records.length, 1);
  assert.equal(JSON.stringify(result).includes(privateComment), false);
  assert.ok(result.warnings.some((warning) => /respondent comment/i.test(warning)));
});

test("rejects malformed percentages, counts, NPS and non-report matrices", () => {
  const malformedCases = [
    [
      ["Q1. Bad percentage"],
      ["Answer Choices", "Responses", ""],
      ["Yes", "140%", "1"],
    ],
    [
      ["Q1. Missing count"],
      ["Answer Choices", "Responses", ""],
      ["Yes", "100%", ""],
    ],
    [
      ["Q1. Bad NPS"],
      ["Detractors (0-6)", "", "Promoters (9-10)", "", "Net Promoter Score"],
      ["20%", "2", "80%", "8", "150"],
    ],
    [["ordinary", "wide", "dataset"], ["a", "b", "c"]],
  ];
  malformedCases.forEach((matrix) =>
    assert.throws(
      () => parseSurveyMonkeyReportMatrix(matrix, { sourceName: "malformed.csv" }),
      SurveyMonkeyReportError,
    ),
  );
});

test("rejects excessive matrix dimensions and cell sizes", () => {
  const tooManyRows = Array.from({ length: LIMITS.maxRows + 1 }, () => [""]);
  assert.throws(
    () => parseSurveyMonkeyReportMatrix(tooManyRows, { sourceName: "large.csv" }),
    /row limit/i,
  );
  const tooWide = [Array.from({ length: LIMITS.maxColumns + 1 }, () => "cell")];
  assert.throws(
    () => parseSurveyMonkeyReportMatrix(tooWide, { sourceName: "wide.csv" }),
    /column limit/i,
  );
  assert.throws(
    () =>
      parseSurveyMonkeyReportMatrix([["x".repeat(LIMITS.maxCellCharacters + 1)]], {
        sourceName: "cell.csv",
      }),
    /cell size/i,
  );
});

test("rejects malformed matrix API values and unsafe source names", () => {
  assert.equal(detectSurveyMonkeyAggregateReport(null), false);
  assert.throws(
    () => parseSurveyMonkeyReportMatrix([], { sourceName: "empty.csv" }),
    /contain rows/i,
  );
  assert.throws(
    () => parseSurveyMonkeyReportMatrix(simpleAndNpsMatrix),
    /sourceName/i,
  );
  assert.throws(
    () => parseSurveyMonkeyReportMatrix(simpleAndNpsMatrix, { sourceName: `${"x".repeat(256)}.csv` }),
    /filename is too long/i,
  );
  assert.throws(
    () => parseSurveyMonkeyReportMatrix(["not a row"], { sourceName: "bad.csv" }),
    /row 1 is malformed/i,
  );
  assert.throws(
    () => parseSurveyMonkeyReportMatrix([[{}]], { sourceName: "bad.csv" }),
    /unsupported type/i,
  );
  assert.throws(
    () => parseSurveyMonkeyReportMatrix([[Number.NaN]], { sourceName: "bad.csv" }),
    /not finite/i,
  );
});

test("reports and ignores a free-text-only question block in a valid main report", () => {
  const matrix = [
    ["Survey"],
    ["Q1. Quantitative question"],
    ["Answer Choices", "Responses", ""],
    ["Yes", "100%", "2"],
    ["Q2. Please describe your experience"],
    ["", "Answered", "2"],
    ["", "Skipped", "0"],
    ["Respondent ID", "Response Date", "Comment"],
    ["1", "today", "private"],
  ];
  const result = parseSurveyMonkeyReportMatrix(matrix, { sourceName: "main.csv" });
  assert.equal(result.records.length, 1);
  assert.ok(result.warnings.some((warning) => /free-text-only content/i.test(warning)));
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("rejects missing NPS data and incomplete matrix response pairs", () => {
  assert.throws(
    () =>
      parseSurveyMonkeyReportMatrix(
        [
          ["Q1. NPS"],
          ["Detractors (0-6)", "", "Promoters (9-10)", "", "Net Promoter Score"],
          ["", "", "", "", ""],
        ],
        { sourceName: "nps.csv" },
      ),
    /no aggregate data row/i,
  );
  assert.throws(
    () =>
      parseSurveyMonkeyReportMatrix(
        [
          ["Q1. Matrix"],
          ["", "No", "", "Yes", "", "Total", "Weighted Average"],
          ["Statement", "20%", "2", "80%", "", "10", "1.8"],
        ],
        { sourceName: "matrix.csv" },
      ),
    /missing a percentage or count/i,
  );
});

test("buffer API rejects formula-bearing XLSX and unsupported extensions", () => {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(simpleAndNpsMatrix);
  worksheet.B4 = { t: "n", f: "1+2", v: 3 };
  XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
  const formulaWorkbook = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  assert.throws(
    () =>
      parseSurveyMonkeyReportBuffer(formulaWorkbook, {
        sourceName: "formula-report.xlsx",
      }),
    /formula/i,
  );
  assert.throws(
    () => parseSurveyMonkeyReportBuffer(Buffer.from("data"), { sourceName: "report.txt" }),
    /CSV and XLSX/i,
  );
  assert.throws(
    () => parseSurveyMonkeyReportBuffer(Buffer.alloc(0), { sourceName: "empty.csv" }),
    /buffer is empty/i,
  );
  assert.throws(
    () => parseSurveyMonkeyReportBuffer(Buffer.from("not-xlsx"), { sourceName: "fake.xlsx" }),
    /signature is invalid/i,
  );
  assert.throws(
    () => parseSurveyMonkeyReportBuffer(Buffer.from([65, 0, 66]), { sourceName: "binary.csv" }),
    /binary data/i,
  );
  assert.throws(
    () => parseSurveyMonkeyReportBuffer(Buffer.from([0xc3, 0x28]), { sourceName: "encoding.csv" }),
    /UTF-8/i,
  );
});
