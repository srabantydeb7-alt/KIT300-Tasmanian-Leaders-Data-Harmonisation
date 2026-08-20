const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const initSqlJs = require("sql.js");
const { unzipSync } = require("fflate");
const XLSX = require("@e965/xlsx");

const { createCsv } = require("./exportService");
const { parseDatasetBuffer } = require("./fileParser");
const { suggestMappings } = require("./mappingService");
const { profileRows } = require("./profileService");
const { DEFAULT_RULES, ELF_TEMPLATE, TARGET_QUESTIONS } = require("./questionLibrary");
const { parseSurveyMonkeyReportBuffer } = require("./surveyMonkeyReportParser");
const { applyTransformation } = require("./transformationService");

const PACK_LIMITS = Object.freeze({
  maxFiles: 5_000,
  maxArchiveBytes: 25 * 1024 * 1024,
  maxArchiveEntries: 1_000,
  maxArchiveEntryBytes: 10 * 1024 * 1024,
  maxArchiveExpandedBytes: 50 * 1024 * 1024,
});

class DatasetPackError extends Error {
  constructor(message) {
    super(message);
    this.name = "DatasetPackError";
    this.status = 400;
  }
}

function normalisedPath(relativePath) {
  return String(relativePath).replaceAll("\\", "/");
}

function classifyPackPath(relativePath) {
  const sourceFile = normalisedPath(relativePath);
  const lower = sourceFile.toLocaleLowerCase("en-AU");
  const extension = path.extname(lower);
  if (/names for elf data\.xlsx$/.test(lower)) {
    return { role: "restricted_linkage", reason: "Contains direct identity linkage data." };
  }
  if (/(?:application|acceptance)(?: form)?/.test(lower)) {
    return {
      role: "restricted_administration",
      reason: "Application and acceptance records are restricted administration data, not evaluation responses.",
    };
  }
  if (extension === ".zip") {
    return { role: "evaluation_aggregate_archive", reason: "SurveyMonkey aggregate archive." };
  }
  if (
    extension === ".xlsx" &&
    /tlp participant graduation survey/.test(lower) &&
    /20(?:17|18|19|20|21)/.test(lower)
  ) {
    return { role: "evaluation_aggregate_workbook", reason: "SurveyMonkey aggregate workbook." };
  }
  if (
    [".csv", ".xlsx", ".xls"].includes(extension) &&
    (/elfs data\//.test(lower) || /completion survey 2024 yp\.xlsx$/.test(lower))
  ) {
    return { role: "evaluation_raw", reason: "Row-level evaluation survey." };
  }
  if ([".csv", ".xlsx", ".xls"].includes(extension)) {
    return {
      role: "unclassified_tabular",
      reason: "Tabular source is outside the approved evaluation families and requires review.",
    };
  }
  return { role: "non_dataset", reason: "Supporting reference file." };
}

function safeStat(filePath) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) return null;
  return stat;
}

function walkDatasetFiles(sourceDir) {
  const found = [];
  const pending = [sourceDir];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        pending.push(fullPath);
      } else if (entry.isFile()) {
        const extension = path.extname(entry.name).toLowerCase();
        if ([".csv", ".xls", ".xlsx", ".zip"].includes(extension)) found.push(fullPath);
      }
      if (found.length > PACK_LIMITS.maxFiles) {
        throw new DatasetPackError(`Dataset packs are limited to ${PACK_LIMITS.maxFiles} files.`);
      }
    }
  }
  return found.sort((left, right) => left.localeCompare(right));
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function metadataFromPath(relativePath) {
  const sourceFile = normalisedPath(relativePath);
  const lower = sourceFile.toLocaleLowerCase("en-AU");
  let program = "Tasmanian Leaders";
  if (/i-?lead/.test(lower)) program = "I-LEAD";
  else if (/\btlp\b|tasmanian leaders program/.test(lower)) program = "Tasmanian Leaders Program";
  else if (/\bdrip\b|drought resilience/.test(lower)) program = "DRIP";
  else if (/\bteal\b/.test(lower)) program = "TEAL";
  else if (/\blarc\b/.test(lower)) program = "LARC";
  else if (/next crop/.test(lower)) program = "Next Crop Tasmania";

  const year = sourceFile.match(/\b(20\d{2})\b/)?.[1] || "";
  let surveyStage = "evaluation";
  if (/pre[- ]program|commencement/.test(lower)) surveyStage = "pre_program";
  else if (/3[- ]month|delayed|longitudinal/.test(lower)) surveyStage = "delayed_follow_up";
  else if (/completion|graduation|evaluation/.test(lower)) surveyStage = "completion";
  else if (/pulse/.test(lower)) surveyStage = "pulse";
  else if (/impact study/.test(lower)) surveyStage = "impact_study";

  const respondentType = /manager|employer/.test(lower) ? "manager_or_employer" : "participant";
  return { program, year, surveyStage, respondentType };
}

function normaliseIdentifier(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-AU")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function identifierForRow(row, identifierColumns, sourceFile, rowIndex) {
  const nameColumns = identifierColumns.filter((column) => /name/i.test(column));
  const firstName = nameColumns.find((column) => /(?:\(|\b)first(?:\)|\b)/i.test(column));
  const lastName = nameColumns.find((column) => /(?:\(|\b)last(?:\)|\b)/i.test(column));
  if (firstName && lastName) {
    const compactName = [normaliseIdentifier(row[firstName]), normaliseIdentifier(row[lastName])]
      .filter(Boolean)
      .join("|");
    if (compactName) return compactName;
  }
  const preferred = nameColumns.length ? nameColumns : identifierColumns;
  const identifier = preferred
    .map((column) => normaliseIdentifier(row[column]))
    .filter(Boolean)
    .join("|");
  return identifier || `${sourceFile}|anonymous-row|${rowIndex + 2}`;
}

function buildLinkageIndex(buffer) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      raw: true,
      sheetRows: 10_001,
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      bookVBA: false,
    });
  } catch (error) {
    throw new DatasetPackError(`The restricted linkage workbook could not be read: ${error.message}`);
  }
  if (!workbook.SheetNames.length || workbook.SheetNames.length > 10) {
    throw new DatasetPackError("The restricted linkage workbook has an unsupported sheet count.");
  }
  const index = new Map();
  for (const sheetName of workbook.SheetNames) {
    if (!/i-?lead|tlp/i.test(sheetName)) continue;
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      blankrows: false,
      raw: false,
    });
    if (!rows.length || rows[0].length > 100) continue;
    const program = /i-?lead/i.test(sheetName) ? "I-LEAD" : "Tasmanian Leaders Program";
    for (let column = 0; column + 1 < rows[0].length; column += 2) {
      const rawLabel = String(rows[0][column] || "").trim();
      if (!rawLabel) continue;
      const cohortYear = rawLabel.match(/\b(20\d{2})\b/)?.[1] || "";
      const programStream = /^20\d{2}$/.test(rawLabel)
        ? `${program === "I-LEAD" ? "I-LEAD" : "TLP"} ${rawLabel}`
        : rawLabel;
      for (const row of rows.slice(1)) {
        const key = [normaliseIdentifier(row[column]), normaliseIdentifier(row[column + 1])]
          .filter(Boolean)
          .join("|");
        if (!key) continue;
        const candidate = { program, programStream, cohortYear };
        const existing = index.get(key);
        if (existing && JSON.stringify(existing) !== JSON.stringify(candidate)) {
          index.set(key, { ambiguous: true });
        } else if (!existing) {
          index.set(key, candidate);
        }
      }
    }
  }
  return index;
}

function hmacPersonId(secret, identifier) {
  return crypto.createHmac("sha256", secret).update(identifier).digest("hex");
}

function latestRules() {
  return new Map(DEFAULT_RULES.map((rule) => [rule.ruleId, rule]));
}

function safeRowMetadata(row, fallback, linkage) {
  const linked = linkage && !linkage.ambiguous ? linkage : {};
  const program = String(row["Which Program Are You In?"] || linked.program || fallback.program).trim();
  const programStream = String(row["Which I-LEAD Are You In?"] || linked.programStream || "").trim();
  const cohortYear = String(row["What Year is Your First Workshop In?"] || linked.cohortYear || fallback.year).trim();
  return { program, programStream, cohortYear };
}

function targetByCode(code) {
  return TARGET_QUESTIONS.find((question) => question.code === code) || null;
}

function processRawEvaluation({ buffer, sourceFile, hmacSecret, linkageIndex = new Map() }) {
  const parsed = parseDatasetBuffer(buffer, path.basename(sourceFile));
  const profile = profileRows(parsed.rows);
  const suggestions = suggestMappings(profile.questionColumns, TARGET_QUESTIONS, profile);
  const rules = latestRules();
  const fileMetadata = metadataFromPath(sourceFile);
  const mappings = suggestions.map((mapping) => {
    const target = targetByCode(mapping.targetQuestionCode);
    const safeApproved =
      mapping.status === "approved" &&
      target &&
      target.responseType !== "free_text" &&
      rules.has(mapping.ruleId);
    return {
      sourceFile,
      sourceQuestion: mapping.sourceQuestion,
      targetQuestionCode: safeApproved ? mapping.targetQuestionCode : "",
      targetQuestion: safeApproved ? mapping.targetQuestion : "",
      domain: safeApproved ? target.domain || "" : "",
      construct: safeApproved ? target.construct || "" : "",
      confidence: mapping.confidence,
      method: mapping.method,
      status: safeApproved ? "approved" : "excluded_pending_review",
      ruleId: safeApproved ? mapping.ruleId : "",
      ruleVersion: safeApproved ? rules.get(mapping.ruleId).version : "",
    };
  });
  const approved = new Map(
    mappings.filter((mapping) => mapping.status === "approved").map((mapping) => [mapping.sourceQuestion, mapping]),
  );
  const responses = [];
  const validationIssues = [];

  parsed.rows.forEach((row, rowIndex) => {
    const linkageKey = identifierForRow(row, profile.identifierColumns, sourceFile, rowIndex);
    const personId = hmacPersonId(
      hmacSecret,
      linkageKey,
    );
    const rowMetadata = safeRowMetadata(row, fileMetadata, linkageIndex.get(linkageKey));
    for (const [sourceQuestion, mapping] of approved) {
      const originalValue = row[sourceQuestion] ?? "";
      const transformed = applyTransformation(originalValue, rules.get(mapping.ruleId));
      const target = targetByCode(mapping.targetQuestionCode);
      responses.push({
        datasetId: sha256(buffer).slice(0, 16),
        sourceFile,
        program: rowMetadata.program,
        programStream: rowMetadata.programStream,
        cohortYear: rowMetadata.cohortYear,
        surveyStage: fileMetadata.surveyStage,
        respondentType: target?.respondentType || fileMetadata.respondentType,
        personId,
        sourceRow: rowIndex + 2,
        sourceColumn: sourceQuestion,
        originalQuestion: sourceQuestion,
        originalValue,
        questionCode: mapping.targetQuestionCode,
        targetQuestion: mapping.targetQuestion,
        framework: target?.framework || "",
        domain: target?.domain || "",
        construct: target?.construct || "",
        reverseScored: target?.reverseScored === true,
        harmonisedValue: transformed.value,
        transformationStatus: transformed.status,
        ruleId: mapping.ruleId,
        ruleVersion: mapping.ruleVersion,
        scoringApplied: false,
      });
      if (!["valid", "missing"].includes(transformed.status)) {
        validationIssues.push({
          sourceFile,
          severity: "error",
          code: transformed.status.toUpperCase(),
          location: `row ${rowIndex + 2}, ${sourceQuestion}`,
          message: "A response was not valid for the approved canonical destination rule.",
          recommendation: "Review the response label and destination rule without guessing a replacement.",
        });
      }
    }
  });

  for (const mapping of mappings.filter((item) => item.status !== "approved")) {
    validationIssues.push({
      sourceFile,
      severity: "warning",
      code: "QUESTION_NOT_HARMONISED",
      location: mapping.sourceQuestion,
      message: "The question was retained in the mapping log but excluded from the master response output.",
      recommendation: "Approve a semantically valid destination mapping before including this question.",
    });
  }
  if (!profile.identifierColumns.length) {
    validationIssues.push({
      sourceFile,
      severity: "warning",
      code: "NO_LINKAGE_IDENTIFIER",
      location: "dataset",
      message: "No participant linkage field was detected; stable per-row pseudonyms were used.",
      recommendation: "Confirm whether person-level longitudinal linkage is required for this source.",
    });
  }

  return { parsed, profile, mappings, responses, validationIssues };
}

function safeArchiveEntries(buffer, archiveName) {
  if (buffer.length > PACK_LIMITS.maxArchiveBytes) {
    throw new DatasetPackError(`${archiveName} exceeds the archive size limit.`);
  }
  let entryCount = 0;
  let expandedBytes = 0;
  let entries;
  try {
    entries = unzipSync(new Uint8Array(buffer), {
      filter(entry) {
        entryCount += 1;
        const entryName = normalisedPath(entry.name);
        const entryBytes = Number(entry.originalSize || 0);
        if (
          entryCount > PACK_LIMITS.maxArchiveEntries ||
          entryName.startsWith("/") ||
          entryName.split("/").includes("..") ||
          entryBytes > PACK_LIMITS.maxArchiveEntryBytes
        ) {
          throw new DatasetPackError(`${archiveName} contains an unsafe archive member.`);
        }
        expandedBytes += entryBytes;
        if (expandedBytes > PACK_LIMITS.maxArchiveExpandedBytes) {
          throw new DatasetPackError(`${archiveName} exceeds the expanded size limit.`);
        }
        return entryName.toLowerCase().endsWith(".csv");
      },
    });
  } catch (error) {
    if (error instanceof DatasetPackError) throw error;
    throw new DatasetPackError(`${archiveName} could not be opened safely: ${error.message}`);
  }
  return Object.fromEntries(
    Object.entries(entries).map(([name, value]) => [normalisedPath(name), Buffer.from(value)]),
  );
}

function mainAggregateMember(entries, archiveName) {
  const candidates = Object.keys(entries).filter((name) => {
    const base = path.basename(name);
    return !/_Text\.csv$/i.test(base) && !/^Responses_/i.test(base);
  });
  if (candidates.length !== 1) {
    throw new DatasetPackError(
      `${archiveName} must contain exactly one canonical aggregate CSV report; found ${candidates.length}.`,
    );
  }
  return candidates[0];
}

function processAggregate({ buffer, sourceFile, sourceName = path.basename(sourceFile) }) {
  const parsed = parseSurveyMonkeyReportBuffer(buffer, { sourceName });
  const fileMetadata = metadataFromPath(sourceFile);
  const mappingCache = new Map();
  const mappings = [];
  const rules = latestRules();
  const aggregateRecords = parsed.records.map((record) => {
    const cacheKey = record.questionText;
    if (!mappingCache.has(cacheKey)) {
      const [suggestion] = suggestMappings([record.questionText], TARGET_QUESTIONS);
      const target = targetByCode(suggestion.targetQuestionCode);
      const approved = suggestion.status === "approved" && target && target.responseType !== "free_text";
      const mapping = {
        sourceFile,
        sourceQuestion: record.questionText,
        targetQuestionCode: approved ? suggestion.targetQuestionCode : "",
        targetQuestion: approved ? suggestion.targetQuestion : "",
        domain: approved ? target.domain || "" : "",
        construct: approved ? target.construct || "" : "",
        confidence: suggestion.confidence,
        method: suggestion.method,
        status: approved ? "approved" : "pending_semantic_review",
        ruleId: approved ? suggestion.ruleId || target.defaultRuleId || "" : "",
        ruleVersion: approved && rules.get(suggestion.ruleId || target.defaultRuleId)
          ? rules.get(suggestion.ruleId || target.defaultRuleId).version
          : "",
      };
      mappingCache.set(cacheKey, mapping);
      mappings.push(mapping);
    }
    const mapping = mappingCache.get(cacheKey);
    const target = targetByCode(mapping.targetQuestionCode);
    const rule = rules.get(mapping.ruleId);
    const transformed = rule
      ? applyTransformation(record.responseOption, rule)
      : { value: null, status: "not_transformed" };
    return {
      datasetId: sha256(buffer).slice(0, 16),
      sourceFile,
      program: fileMetadata.program,
      cohortYear: fileMetadata.year,
      surveyStage: fileMetadata.surveyStage,
      respondentType: fileMetadata.respondentType,
      sourceQuestionCode: record.questionCode,
      sourceQuestion: record.questionText,
      responseOption: record.responseOption,
      responseCount: record.responseCount,
      responsePercent: record.responsePercent,
      answered: record.answered,
      skipped: record.skipped,
      nps: record.nps,
      weightedAverage: record.weightedAverage,
      sourceRow: record.sourceRow,
      questionCode: mapping.targetQuestionCode,
      targetQuestion: mapping.targetQuestion,
      framework: target?.framework || "",
      domain: target?.domain || "",
      construct: target?.construct || "",
      canonicalResponseOption: transformed.status === "valid" ? transformed.value : "",
      transformationStatus: transformed.status,
      mappingStatus: mapping.status,
    };
  });
  const validationIssues = mappings
    .filter((mapping) => mapping.status !== "approved")
    .map((mapping) => ({
      sourceFile,
      severity: "warning",
      code: "AGGREGATE_MAPPING_REVIEW",
      location: mapping.sourceQuestion,
      message: "Historical aggregate question has no approved destination-equivalent mapping.",
      recommendation: "Review meaning, denominator, respondent type and scale before combining this measure.",
    }));
  return { parsed, aggregateRecords, mappings, validationIssues };
}

const OUTPUT_SCHEMAS = Object.freeze({
  responses: [
    "datasetId", "sourceFile", "program", "programStream", "cohortYear", "surveyStage",
    "respondentType", "personId", "sourceRow", "sourceColumn", "originalQuestion",
    "originalValue", "questionCode", "targetQuestion", "framework", "domain", "construct",
    "reverseScored", "harmonisedValue", "transformationStatus", "ruleId", "ruleVersion",
    "scoringApplied",
  ],
  aggregateRecords: [
    "datasetId", "sourceFile", "program", "cohortYear", "surveyStage", "respondentType",
    "sourceQuestionCode", "sourceQuestion", "responseOption", "responseCount",
    "responsePercent", "answered", "skipped", "nps", "weightedAverage", "sourceRow",
    "questionCode", "targetQuestion", "framework", "domain", "construct",
    "canonicalResponseOption", "transformationStatus", "mappingStatus",
  ],
  datasetCatalog: [
    "sourceFile", "role", "status", "reason", "format", "sizeBytes", "sha256", "program",
    "cohortYear", "surveyStage", "respondentType", "rowCount", "columnCount",
    "aggregateRecordCount", "excludedFreeTextMembers", "warnings",
  ],
  mappings: [
    "sourceFile", "sourceQuestion", "targetQuestionCode", "targetQuestion", "domain",
    "construct", "confidence", "method", "status", "ruleId", "ruleVersion",
  ],
  validationIssues: ["sourceFile", "severity", "code", "location", "message", "recommendation"],
  dataDictionary: [
    "questionCode", "questionLabel", "framework", "frameworkVersion", "domain", "construct",
    "respondentType", "responseType", "reverseScored", "defaultRuleId", "scoringStatus",
  ],
});

function csvFor(schemaName, rows) {
  return createCsv(
    OUTPUT_SCHEMAS[schemaName].map((key) => ({ key, label: key })),
    rows,
  );
}

function inferSqlType(rows, key) {
  const values = rows.map((row) => row[key]).filter((value) => value !== "" && value !== null && value !== undefined);
  if (values.length && values.every((value) => typeof value === "boolean" || Number.isInteger(value))) return "INTEGER";
  if (values.length && values.every((value) => typeof value === "number")) return "REAL";
  return "TEXT";
}

async function sqliteBuffer(tables) {
  const SQL = await initSqlJs();
  const database = new SQL.Database();
  try {
    for (const [tableName, { schemaName, rows }] of Object.entries(tables)) {
      const columns = OUTPUT_SCHEMAS[schemaName];
      const definitions = columns
        .map((column) => `"${column}" ${inferSqlType(rows, column)}`)
        .join(", ");
      database.run(`CREATE TABLE "${tableName}" (${definitions})`);
      if (!rows.length) continue;
      const statement = database.prepare(
        `INSERT INTO "${tableName}" VALUES (${columns.map(() => "?").join(",")})`,
      );
      try {
        rows.forEach((row) => statement.run(columns.map((column) => row[column] ?? null)));
      } finally {
        statement.free();
      }
    }
    return Buffer.from(database.export());
  } finally {
    database.close();
  }
}

function outputDirectory(outputDir) {
  const resolved = path.resolve(outputDir);
  if (fs.existsSync(resolved)) {
    const stat = fs.lstatSync(resolved);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new DatasetPackError("The output path must be a regular directory.");
    }
    if (fs.readdirSync(resolved).length) {
      throw new DatasetPackError("The output directory must be empty to prevent accidental overwrite.");
    }
  } else {
    fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
  }
  return resolved;
}

async function harmoniseDatasetPack({ sourceDir, outputDir, hmacSecret, generatedAt = new Date().toISOString() }) {
  if (!hmacSecret || Buffer.byteLength(String(hmacSecret), "utf8") < 32) {
    throw new DatasetPackError("A HMAC secret containing at least 32 bytes is required.");
  }
  const resolvedSource = path.resolve(sourceDir);
  const sourceStat = fs.existsSync(resolvedSource) ? fs.lstatSync(resolvedSource) : null;
  if (!sourceStat?.isDirectory() || sourceStat.isSymbolicLink()) {
    throw new DatasetPackError("The dataset pack source must be a regular directory.");
  }
  const resolvedOutput = outputDirectory(outputDir);
  const files = walkDatasetFiles(resolvedSource);
  const linkageFile = files.find((fullPath) =>
    classifyPackPath(path.relative(resolvedSource, fullPath)).role === "restricted_linkage",
  );
  const linkageIndex = linkageFile
    ? buildLinkageIndex(fs.readFileSync(linkageFile))
    : new Map();
  const datasetCatalog = [];
  const responses = [];
  const aggregateRecords = [];
  const mappings = [];
  const validationIssues = [];

  for (const fullPath of files) {
    const relativePath = normalisedPath(path.relative(resolvedSource, fullPath));
    const classification = classifyPackPath(relativePath);
    const stat = safeStat(fullPath);
    if (!stat) continue;
    const buffer = fs.readFileSync(fullPath);
    const fileMetadata = metadataFromPath(relativePath);
    const catalog = {
      sourceFile: relativePath,
      role: classification.role,
      status: "not_processed",
      reason: classification.reason,
      format: path.extname(relativePath).slice(1).toLowerCase(),
      sizeBytes: stat.size,
      sha256: sha256(buffer),
      program: fileMetadata.program,
      cohortYear: fileMetadata.year,
      surveyStage: fileMetadata.surveyStage,
      respondentType: fileMetadata.respondentType,
      rowCount: "",
      columnCount: "",
      aggregateRecordCount: "",
      excludedFreeTextMembers: "",
      warnings: "",
    };
    try {
      if (["restricted_linkage", "restricted_administration"].includes(classification.role)) {
        catalog.status = "excluded_restricted";
      } else if (classification.role === "unclassified_tabular") {
        catalog.status = "excluded_pending_classification";
        validationIssues.push({
          sourceFile: relativePath,
          severity: "warning",
          code: "UNCLASSIFIED_TABULAR_SOURCE",
          location: "dataset",
          message: "The source was catalogued but not treated as evaluation data.",
          recommendation: "Classify the dataset purpose and privacy tier before harmonisation.",
        });
      } else if (classification.role === "evaluation_raw") {
        const processed = processRawEvaluation({
          buffer,
          sourceFile: relativePath,
          hmacSecret,
          linkageIndex,
        });
        responses.push(...processed.responses);
        mappings.push(...processed.mappings);
        validationIssues.push(...processed.validationIssues);
        catalog.status = "harmonised";
        catalog.rowCount = processed.profile.rowCount;
        catalog.columnCount = processed.profile.columnCount;
        catalog.warnings = processed.validationIssues.length;
      } else if (classification.role === "evaluation_aggregate_workbook") {
        const processed = processAggregate({ buffer, sourceFile: relativePath });
        aggregateRecords.push(...processed.aggregateRecords);
        mappings.push(...processed.mappings);
        validationIssues.push(...processed.validationIssues);
        catalog.status = "harmonised_aggregate";
        catalog.aggregateRecordCount = processed.aggregateRecords.length;
        catalog.warnings = processed.validationIssues.length;
      } else if (classification.role === "evaluation_aggregate_archive") {
        const entries = safeArchiveEntries(buffer, relativePath);
        const member = mainAggregateMember(entries, relativePath);
        const processed = processAggregate({
          buffer: entries[member],
          sourceFile: `${relativePath}::${member}`,
          sourceName: path.basename(member),
        });
        aggregateRecords.push(...processed.aggregateRecords);
        mappings.push(...processed.mappings);
        validationIssues.push(...processed.validationIssues);
        catalog.status = "harmonised_aggregate";
        catalog.aggregateRecordCount = processed.aggregateRecords.length;
        catalog.excludedFreeTextMembers = Object.keys(entries).filter((name) => /_Text\.csv$/i.test(name)).length;
        catalog.warnings = processed.validationIssues.length;
      }
    } catch (error) {
      catalog.status = "failed_validation";
      catalog.warnings = 1;
      validationIssues.push({
        sourceFile: relativePath,
        severity: "error",
        code: "SOURCE_IMPORT_FAILED",
        location: "dataset",
        message: error.message,
        recommendation: "Review the source structure; no rows from this source were added to the master outputs.",
      });
    }
    datasetCatalog.push(catalog);
  }

  const dataDictionary = TARGET_QUESTIONS.map((question) => ({
    questionCode: question.code,
    questionLabel: question.label,
    framework: question.framework || "",
    frameworkVersion: question.frameworkVersion || "",
    domain: question.domain || "",
    construct: question.construct || "",
    respondentType: question.respondentType || "",
    responseType: question.responseType || "",
    reverseScored: question.reverseScored === true,
    defaultRuleId: question.defaultRuleId || "",
    scoringStatus: question.framework ? ELF_TEMPLATE.scoringStatus : "not_applicable",
  }));

  const outputs = {
    "master-harmonised.csv": csvFor("responses", responses),
    "historical-aggregate.csv": csvFor("aggregateRecords", aggregateRecords),
    "dataset-catalog.csv": csvFor("datasetCatalog", datasetCatalog),
    "question-mappings.csv": csvFor("mappings", mappings),
    "validation-report.csv": csvFor("validationIssues", validationIssues),
    "data-dictionary.csv": csvFor("dataDictionary", dataDictionary),
  };
  Object.entries(outputs).forEach(([filename, contents]) =>
    fs.writeFileSync(path.join(resolvedOutput, filename), contents, { encoding: "utf8", mode: 0o600, flag: "wx" }),
  );
  const sqlite = await sqliteBuffer({
    harmonised_responses: { schemaName: "responses", rows: responses },
    historical_aggregates: { schemaName: "aggregateRecords", rows: aggregateRecords },
    dataset_catalog: { schemaName: "datasetCatalog", rows: datasetCatalog },
    question_mappings: { schemaName: "mappings", rows: mappings },
    validation_issues: { schemaName: "validationIssues", rows: validationIssues },
    data_dictionary: { schemaName: "dataDictionary", rows: dataDictionary },
  });
  fs.writeFileSync(path.join(resolvedOutput, "harmonised-master.sqlite"), sqlite, { mode: 0o600, flag: "wx" });

  const manifest = {
    generatedAt,
    sourceDirectoryName: path.basename(resolvedSource),
    destination: {
      code: ELF_TEMPLATE.code,
      name: ELF_TEMPLATE.name,
      frameworkVersion: ELF_TEMPLATE.frameworkVersion,
      scoringStatus: ELF_TEMPLATE.scoringStatus,
    },
    counts: {
      cataloguedDatasets: datasetCatalog.length,
      harmonisedParticipantResponses: responses.length,
      harmonisedAggregateRecords: aggregateRecords.length,
      mappings: mappings.length,
      validationErrors: validationIssues.filter((issue) => issue.severity === "error").length,
      validationWarnings: validationIssues.filter((issue) => issue.severity === "warning").length,
    },
    privacy: {
      identifiers: "HMAC-SHA256 pseudonyms only",
      applicationAndAcceptanceRecords: "catalogued and excluded",
      freeTextAttachments: "excluded",
      rawIdentifiersPersisted: false,
    },
    limitations: [
      "The supplied ELF does not define numeric scoring, construct weights, aggregation or missing-item rules; none were invented.",
      "Aggregate SurveyMonkey summaries remain aggregate and are not converted into participant-level rows.",
      "Similarity-only semantic matches remain pending review and are excluded from combined measures.",
    ],
    outputHashes: Object.fromEntries(
      [...Object.keys(outputs), "harmonised-master.sqlite"].map((filename) => [
        filename,
        sha256(fs.readFileSync(path.join(resolvedOutput, filename))),
      ]),
    ),
  };
  fs.writeFileSync(
    path.join(resolvedOutput, "run-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600, flag: "wx" },
  );

  return {
    outputDir: resolvedOutput,
    datasetCatalog,
    responses,
    aggregateRecords,
    mappings,
    validationIssues,
    dataDictionary,
    manifest,
  };
}

module.exports = {
  DatasetPackError,
  PACK_LIMITS,
  buildLinkageIndex,
  classifyPackPath,
  harmoniseDatasetPack,
  metadataFromPath,
  normaliseIdentifier,
  processAggregate,
  processRawEvaluation,
  safeArchiveEntries,
};
