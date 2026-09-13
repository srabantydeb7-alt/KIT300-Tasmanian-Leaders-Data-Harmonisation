const path = require("node:path");
const XLSX = require("@e965/xlsx");

const LIMITS = Object.freeze({
  maxFileBytes: 10 * 1024 * 1024,
  maxRows: 20_000,
  maxColumns: 500,
  maxCellCharacters: 32_000,
  maxRecords: 100_000,
  maxSheets: 5,
});

class SurveyMonkeyReportError extends Error {
  constructor(message) {
    super(message);
    this.name = "SurveyMonkeyReportError";
    this.status = 400;
  }
}

/**
 * Matrix API contract:
 *   parseSurveyMonkeyReportMatrix(matrix, { sourceName })
 *
 * `matrix` is an array of row arrays whose cells are strings, finite numbers,
 * booleans, null or undefined. Percentages must be expressed as `54.2%` or as
 * a number on the 0-100 scale. `sourceName` is required so Q*_Text attachments
 * can be rejected before their content is interpreted.
 *
 * Buffer API contract:
 *   parseSurveyMonkeyReportBuffer(buffer, { sourceName })
 *
 * `sourceName` must end in .csv or .xlsx. Only the first values-only worksheet
 * is accepted. Formula cells, binary CSV, Q*_Text attachments and respondent-
 * level free-text exports are rejected.
 */

function clean(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function validateSourceName(sourceName, { requireExtension = false } = {}) {
  if (typeof sourceName !== "string" || !sourceName.trim()) {
    throw new SurveyMonkeyReportError("A sourceName is required for SurveyMonkey reports.");
  }
  const baseName = path.basename(sourceName.trim());
  if (baseName.length > 255) {
    throw new SurveyMonkeyReportError("The SurveyMonkey source filename is too long.");
  }
  if (/^q\d+[a-z]?_text\.(?:csv|xlsx)$/i.test(baseName)) {
    throw new SurveyMonkeyReportError(
      "SurveyMonkey Q*_Text free-text attachments are not accepted by the aggregate parser.",
    );
  }
  const extension = path.extname(baseName).toLowerCase();
  if (requireExtension && ![".csv", ".xlsx"].includes(extension)) {
    throw new SurveyMonkeyReportError("Only SurveyMonkey CSV and XLSX reports are supported.");
  }
  return { baseName, extension };
}

function validateMatrix(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) {
    throw new SurveyMonkeyReportError("SurveyMonkey report matrix must contain rows.");
  }
  if (matrix.length > LIMITS.maxRows) {
    throw new SurveyMonkeyReportError(
      `SurveyMonkey report exceeds the ${LIMITS.maxRows} row limit.`,
    );
  }

  return matrix.map((row, rowIndex) => {
    if (!Array.isArray(row)) {
      throw new SurveyMonkeyReportError(`SurveyMonkey row ${rowIndex + 1} is malformed.`);
    }
    if (row.length > LIMITS.maxColumns) {
      throw new SurveyMonkeyReportError(
        `SurveyMonkey report exceeds the ${LIMITS.maxColumns} column limit.`,
      );
    }
    return row.map((value, columnIndex) => {
      if (
        value !== null &&
        value !== undefined &&
        !["string", "number", "boolean"].includes(typeof value)
      ) {
        throw new SurveyMonkeyReportError(
          `SurveyMonkey cell at row ${rowIndex + 1}, column ${columnIndex + 1} has an unsupported type.`,
        );
      }
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new SurveyMonkeyReportError(
          `SurveyMonkey cell at row ${rowIndex + 1}, column ${columnIndex + 1} is not finite.`,
        );
      }
      const text = clean(value);
      if (text.length > LIMITS.maxCellCharacters) {
        throw new SurveyMonkeyReportError(
          `SurveyMonkey cell size exceeds ${LIMITS.maxCellCharacters} characters.`,
        );
      }
      return text;
    });
  });
}

function parseQuestion(value) {
  const match = /^(Q\d+[a-z]?)[.)]?\s*(.+)$/i.exec(clean(value));
  return match
    ? {
        questionCode: match[1].toUpperCase(),
        sectionText: match[2].trim(),
      }
    : null;
}

function isBlankRow(row) {
  return !row || row.every((value) => !clean(value));
}

function hasRespondentHeader(row) {
  const values = row.map((value) => clean(value).toLowerCase());
  return values.includes("respondent id") &&
    (values.includes("response date") || values.includes("collector id") || values.includes("tags"));
}

function questionStartIndexes(rows) {
  const indexes = [];
  rows.forEach((row, index) => {
    if (parseQuestion(row[0])) indexes.push(index);
  });
  return indexes;
}

function detectSurveyMonkeyAggregateReport(matrix) {
  if (!Array.isArray(matrix)) return false;
  const sample = matrix.slice(0, 200);
  const hasQuestion = sample.some((row) => Array.isArray(row) && parseQuestion(row[0]));
  const hasAggregateMarker = sample.some(
    (row) =>
      Array.isArray(row) &&
      row.some((value) =>
        /^(?:answer choices|responses|weighted average|net promoter score)$/i.test(clean(value)),
      ),
  );
  return hasQuestion && hasAggregateMarker;
}

function looksLikeFreeTextExport(rows) {
  return (
    !questionStartIndexes(rows).length &&
    rows.slice(0, 30).some(hasRespondentHeader)
  );
}

function numberValue(value) {
  const text = clean(value).replace(/,/g, "");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function countValue(value, context) {
  const number = numberValue(value);
  if (number === null || !Number.isInteger(number) || number < 0) {
    throw new SurveyMonkeyReportError(`${context} must contain a non-negative integer count.`);
  }
  return number;
}

function percentValue(value, context) {
  const text = clean(value);
  if (!text) return null;
  const number = numberValue(text.replace(/%$/, ""));
  if (number === null || number < 0 || number > 100) {
    throw new SurveyMonkeyReportError(`${context} must contain a percentage from 0 to 100.`);
  }
  return number;
}

function metricValue(value, context, { min = -Infinity, max = Infinity } = {}) {
  const number = numberValue(value);
  if (number === null || number < min || number > max) {
    throw new SurveyMonkeyReportError(`${context} contains an invalid numeric value.`);
  }
  return number;
}

function firstFollowingValue(row, index) {
  for (let next = index + 1; next < row.length; next += 1) {
    if (clean(row[next])) return row[next];
  }
  return "";
}

function blockMetadata(rows, start, end) {
  let answered = null;
  let skipped = null;
  for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
    const row = rows[rowIndex];
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const label = clean(row[columnIndex]).toLowerCase();
      if (label !== "answered" && label !== "skipped") continue;
      const rawValue = firstFollowingValue(row, columnIndex);
      if (!clean(rawValue)) continue;
      const count = countValue(rawValue, `${label} at row ${rowIndex + 1}`);
      if (label === "answered") answered = count;
      else skipped = count;
    }
  }
  return { answered, skipped };
}

function canonicalRecord({
  question,
  questionText,
  responseOption,
  responseCount,
  responsePercent,
  answered,
  skipped,
  nps = null,
  weightedAverage = null,
  sourceRow,
}) {
  return {
    questionCode: question.questionCode,
    questionText,
    sectionText: question.sectionText,
    responseOption,
    responseCount,
    responsePercent,
    answered,
    skipped,
    nps,
    weightedAverage,
    sourceRow,
  };
}

function safeAnswered(metadata, counts) {
  if (metadata.answered !== null) return metadata.answered;
  return counts.reduce((total, count) => total + count, 0);
}

function looksLikeEmbeddedFreeTextPrompt(value) {
  return /(?:please (?:tell|explain|describe|add|share)|comments?|other.*specify|if yes|if no)/i.test(
    clean(value),
  );
}

function parseChoiceBlock(rows, question, headerIndex, end, metadata) {
  const headers = rows[headerIndex];
  const responseIndex = headers.findIndex((value) => /^responses$/i.test(clean(value)));
  const percentIndex = headers.findIndex((value) => /^response percent$/i.test(clean(value)));
  const countIndex = percentIndex >= 0 ? responseIndex : responseIndex + 1;
  const effectivePercentIndex = percentIndex >= 0 ? percentIndex : responseIndex;
  const records = [];
  const pending = [];

  for (let rowIndex = headerIndex + 1; rowIndex < end; rowIndex += 1) {
    const row = rows[rowIndex];
    const option = clean(row[0]);
    if (!option || /^(?:answered|skipped)$/i.test(option)) continue;
    const percentRaw = row[effectivePercentIndex];
    const countRaw = row[countIndex];
    if (!clean(percentRaw) && !clean(countRaw)) continue;
    if (!clean(percentRaw) && clean(countRaw) && looksLikeEmbeddedFreeTextPrompt(option)) {
      continue;
    }
    if (!clean(percentRaw) || !clean(countRaw)) {
      throw new SurveyMonkeyReportError(
        `Response option at row ${rowIndex + 1} is missing its percentage or count.`,
      );
    }
    pending.push({
      option,
      percent: percentValue(percentRaw, `Response option at row ${rowIndex + 1}`),
      count: countValue(countRaw, `Response option at row ${rowIndex + 1}`),
      sourceRow: rowIndex + 1,
    });
  }

  const answered = safeAnswered(metadata, pending.map((item) => item.count));
  for (const item of pending) {
    records.push(
      canonicalRecord({
        question,
        questionText: question.sectionText,
        responseOption: item.option,
        responseCount: item.count,
        responsePercent: item.percent,
        answered,
        skipped: metadata.skipped,
        sourceRow: item.sourceRow,
      }),
    );
  }
  return records;
}

function parseNpsBlock(rows, question, headerIndex, end, metadata) {
  const headers = rows[headerIndex];
  const npsIndex = headers.findIndex((value) => /net promoter score/i.test(clean(value)));
  const optionIndexes = headers
    .map((value, index) => ({ label: clean(value), index }))
    .filter((item) => item.label && item.index < npsIndex);
  const dataRowIndex = rows.findIndex(
    (row, index) =>
      index > headerIndex &&
      index < end &&
      !isBlankRow(row) &&
      clean(row[npsIndex]) &&
      !row.some((value) => /^(?:answered|skipped)$/i.test(clean(value))),
  );
  if (dataRowIndex < 0) {
    throw new SurveyMonkeyReportError(`NPS block ${question.questionCode} has no aggregate data row.`);
  }

  const dataRow = rows[dataRowIndex];
  const nps = metricValue(dataRow[npsIndex], `NPS at row ${dataRowIndex + 1}`, {
    min: -100,
    max: 100,
  });
  const countOnly =
    optionIndexes.length > 0 &&
    optionIndexes.every((item, index) => item.index === index) &&
    npsIndex === optionIndexes.length;
  const pending = optionIndexes.map(({ label, index }) => {
    if (countOnly) {
      if (!clean(dataRow[index])) {
        throw new SurveyMonkeyReportError(
          `NPS option ${label} at row ${dataRowIndex + 1} is missing a count.`,
        );
      }
      return { label, percent: null, count: countValue(dataRow[index], `NPS option ${label}`) };
    }
    if (!clean(dataRow[index]) || !clean(dataRow[index + 1])) {
      throw new SurveyMonkeyReportError(
        `NPS option ${label} at row ${dataRowIndex + 1} is missing a percentage or count.`,
      );
    }
    return {
      label,
      percent: percentValue(dataRow[index], `NPS option ${label}`),
      count: countValue(dataRow[index + 1], `NPS option ${label}`),
    };
  });
  const answered = safeAnswered(metadata, pending.map((item) => item.count));
  return pending.map((item) =>
    canonicalRecord({
      question,
      questionText: question.sectionText,
      responseOption: item.label,
      responseCount: item.count,
      responsePercent: item.percent ?? (answered ? Number(((item.count / answered) * 100).toFixed(6)) : 0),
      answered,
      skipped: metadata.skipped,
      nps,
      sourceRow: dataRowIndex + 1,
    }),
  );
}

function responseOptionHeaders(headers, totalIndex) {
  return headers
    .map((value, index) => ({ label: clean(value), index }))
    .filter(
      ({ label, index }) =>
        label &&
        index > 0 &&
        index < totalIndex &&
        !/^(?:answer choices|responses|row labels|statements)$/i.test(label),
    );
}

function matrixSkipped(metadata, answered) {
  if (metadata.answered === null || metadata.skipped === null) return metadata.skipped;
  const respondentTotal = metadata.answered + metadata.skipped;
  return answered <= respondentTotal ? respondentTotal - answered : metadata.skipped;
}

function parseMatrixBlock(rows, question, headerIndex, end, metadata) {
  const headers = rows[headerIndex];
  const totalIndex = headers.findIndex((value) => /^total$/i.test(clean(value)));
  const weightedIndex = headers.findIndex((value) => /weighted average/i.test(clean(value)));
  const optionHeaders = responseOptionHeaders(headers, totalIndex);
  const countOnly =
    optionHeaders.length > 0 &&
    optionHeaders.every((item, index) => item.index === index + 1) &&
    optionHeaders.at(-1).index === totalIndex - 1;
  if (!optionHeaders.length) {
    throw new SurveyMonkeyReportError(
      `Matrix block ${question.questionCode} does not contain response options.`,
    );
  }

  const records = [];
  for (let rowIndex = headerIndex + 1; rowIndex < end; rowIndex += 1) {
    const row = rows[rowIndex];
    if (isBlankRow(row) || row.some((value) => /^(?:answered|skipped)$/i.test(clean(value)))) {
      continue;
    }
    const containsResponse = optionHeaders.some(({ index }) =>
      countOnly ? clean(row[index]) : (clean(row[index]) || clean(row[index + 1])),
    );
    if (!containsResponse) continue;

    const pending = optionHeaders.map(({ label, index }) => {
      if (countOnly) {
        if (!clean(row[index])) {
          throw new SurveyMonkeyReportError(
            `Matrix response ${label} at row ${rowIndex + 1} is missing a count.`,
          );
        }
        return {
          label,
          percent: null,
          count: countValue(row[index], `Matrix response ${label} at row ${rowIndex + 1}`),
        };
      }
      if (!clean(row[index]) || !clean(row[index + 1])) {
        throw new SurveyMonkeyReportError(
          `Matrix response ${label} at row ${rowIndex + 1} is missing a percentage or count.`,
        );
      }
      return {
        label,
        percent: percentValue(row[index], `Matrix response ${label} at row ${rowIndex + 1}`),
        count: countValue(row[index + 1], `Matrix response ${label} at row ${rowIndex + 1}`),
      };
    });
    const total = clean(row[totalIndex])
      ? countValue(row[totalIndex], `Matrix total at row ${rowIndex + 1}`)
      : safeAnswered(metadata, pending.map((item) => item.count));
    const weightedAverage = weightedIndex >= 0 && clean(row[weightedIndex])
      ? metricValue(row[weightedIndex], `Weighted average at row ${rowIndex + 1}`)
      : null;
    const rowLabel = clean(row[0]);
    const questionText = rowLabel && !/^\d+(?:\.\d+)?$/.test(rowLabel)
      ? rowLabel
      : question.sectionText;

    for (const item of pending) {
      records.push(
        canonicalRecord({
          question,
          questionText,
          responseOption: item.label,
          responseCount: item.count,
          responsePercent: item.percent ?? (total ? Number(((item.count / total) * 100).toFixed(6)) : 0),
          answered: total,
          skipped: matrixSkipped(metadata, total),
          weightedAverage,
          sourceRow: rowIndex + 1,
        }),
      );
    }
  }
  return records;
}

function headerKind(row) {
  const values = row.map(clean);
  if (values.some((value) => /net promoter score/i.test(value))) return "nps";
  if (
    values.some((value) => /^answer choices$/i.test(value)) &&
    values.some((value) => /^responses$/i.test(value))
  ) {
    return "choice";
  }
  if (
    values.some((value) => /^total$/i.test(value)) &&
    values.some((value) => /weighted average/i.test(value))
  ) {
    return "matrix";
  }
  return null;
}

function questionSummary(records, question) {
  const questionRecords = records.filter(
    (record) => record.questionCode === question.questionCode,
  );
  if (!questionRecords.length) return null;
  const first = questionRecords[0];
  return {
    questionCode: question.questionCode,
    questionText: question.sectionText,
    answered: first.answered,
    skipped: first.skipped,
    nps: first.nps,
    recordCount: questionRecords.length,
  };
}

function parseSurveyMonkeyReportMatrix(matrix, options = {}) {
  const { baseName } = validateSourceName(options.sourceName);
  const rows = validateMatrix(matrix);
  if (looksLikeFreeTextExport(rows)) {
    throw new SurveyMonkeyReportError(
      "Respondent-level free-text SurveyMonkey exports are not accepted by the aggregate parser.",
    );
  }
  if (!detectSurveyMonkeyAggregateReport(rows)) {
    throw new SurveyMonkeyReportError(
      "The file is not a recognised SurveyMonkey aggregate question-block report.",
    );
  }

  const starts = questionStartIndexes(rows);
  const records = [];
  const questions = [];
  const warnings = [
    "Aggregate SurveyMonkey results were imported without participant-level linkage.",
  ];

  starts.forEach((start, position) => {
    const question = parseQuestion(rows[start][0]);
    const blockEnd = position + 1 < starts.length ? starts[position + 1] : rows.length;
    const respondentIndex = rows.findIndex(
      (row, index) => index > start && index < blockEnd && hasRespondentHeader(row),
    );
    const summaryEnd = respondentIndex >= 0 ? respondentIndex : blockEnd;
    if (respondentIndex >= 0) {
      warnings.push(
        `Respondent comment rows embedded after ${question.questionCode} were ignored.`,
      );
    }
    const headerIndex = rows.findIndex(
      (row, index) => index > start && index < summaryEnd && headerKind(row),
    );
    if (headerIndex < 0) {
      warnings.push(
        `No aggregate response table was found for ${question.questionCode}; free-text-only content was ignored.`,
      );
      return;
    }

    const metadata = blockMetadata(rows, headerIndex + 1, summaryEnd);
    const kind = headerKind(rows[headerIndex]);
    let parsed;
    if (kind === "choice") {
      parsed = parseChoiceBlock(rows, question, headerIndex, summaryEnd, metadata);
    } else if (kind === "nps") {
      parsed = parseNpsBlock(rows, question, headerIndex, summaryEnd, metadata);
    } else {
      parsed = parseMatrixBlock(rows, question, headerIndex, summaryEnd, metadata);
    }
    if (records.length + parsed.length > LIMITS.maxRecords) {
      throw new SurveyMonkeyReportError(
        `SurveyMonkey report exceeds the ${LIMITS.maxRecords} aggregate record limit.`,
      );
    }
    records.push(...parsed);
    const summary = questionSummary(parsed, question);
    if (summary) questions.push(summary);
  });

  if (!records.length) {
    throw new SurveyMonkeyReportError(
      "The SurveyMonkey report did not contain valid aggregate response records.",
    );
  }
  return {
    format: "surveymonkey-aggregate-report",
    sourceName: baseName,
    records,
    questions,
    warnings: [...new Set(warnings)],
  };
}

function worksheetContainsFormula(sheet) {
  return Object.entries(sheet).some(
    ([reference, cell]) => !reference.startsWith("!") && cell && cell.f,
  );
}

function assertBufferSignature(buffer, extension) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new SurveyMonkeyReportError("The SurveyMonkey report buffer is empty.");
  }
  if (buffer.length > LIMITS.maxFileBytes) {
    throw new SurveyMonkeyReportError(
      `SurveyMonkey report exceeds the ${LIMITS.maxFileBytes} byte limit.`,
    );
  }
  if (extension === ".xlsx") {
    if (
      buffer[0] !== 0x50 ||
      buffer[1] !== 0x4b ||
      buffer[2] !== 0x03 ||
      buffer[3] !== 0x04
    ) {
      throw new SurveyMonkeyReportError("The SurveyMonkey XLSX signature is invalid.");
    }
  } else {
    if (buffer.includes(0)) {
      throw new SurveyMonkeyReportError("SurveyMonkey CSV reports must not contain binary data.");
    }
    if (buffer.toString("utf8").includes("\uFFFD")) {
      throw new SurveyMonkeyReportError("SurveyMonkey CSV reports must use UTF-8 encoding.");
    }
  }
}

function parseSurveyMonkeyReportBuffer(buffer, options = {}) {
  const { extension } = validateSourceName(options.sourceName, { requireExtension: true });
  assertBufferSignature(buffer, extension);

  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      raw: true,
      sheetRows: LIMITS.maxRows + 2,
      cellFormula: true,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      bookVBA: false,
    });
  } catch (error) {
    throw new SurveyMonkeyReportError(
      `The SurveyMonkey report could not be parsed: ${error.message}`,
    );
  }
  if (!workbook.SheetNames.length || workbook.SheetNames.length > LIMITS.maxSheets) {
    throw new SurveyMonkeyReportError(
      `SurveyMonkey workbooks must contain 1-${LIMITS.maxSheets} worksheets.`,
    );
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (worksheetContainsFormula(sheet)) {
    throw new SurveyMonkeyReportError(
      "Formula-bearing SurveyMonkey workbooks are not accepted; export values only.",
    );
  }
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: true,
    raw: false,
  });
  return parseSurveyMonkeyReportMatrix(matrix, options);
}

module.exports = {
  LIMITS,
  SurveyMonkeyReportError,
  detectSurveyMonkeyAggregateReport,
  parseSurveyMonkeyReportBuffer,
  parseSurveyMonkeyReportMatrix,
};
