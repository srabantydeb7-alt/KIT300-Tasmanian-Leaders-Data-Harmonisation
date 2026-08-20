const crypto = require("node:crypto");

const {
  createBuiltInDestination,
  createDestinationFromDataset,
} = require("./destinationSchema");
const { parseDatasetBuffer } = require("./fileParser");
const { suggestMappings } = require("./mappingService");
const { profileRows } = require("./profileService");
const {
  harmoniseRows,
  latestRule,
  selectedRule,
  TRANSFORM_TYPES,
  versionNumber,
} = require("./transformationService");
const { validateRun } = require("./validationService");

class WorkflowError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "WorkflowError";
    this.status = status;
  }
}

function cleanMetadata(input = {}) {
  const metadata = {};
  for (const field of ["program", "year", "round", "qualityTier", "sourcePath", "knownQuirks"]) {
    const value = input[field];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" || value.trim().length > 250) {
      throw new WorkflowError(400, `${field} must be a short text value.`);
    }
    metadata[field] = value.trim();
  }
  return metadata;
}

function hmacIdentifier(secret, value) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function withoutInternalRows(run) {
  const { sourceRows, ...publicFields } = run;
  return structuredClone(publicFields);
}

function runSummary(run) {
  return {
    id: run.id,
    datasetCode: run.datasetCode,
    stage: run.stage,
    metadata: structuredClone(run.metadata),
    source: structuredClone(run.source),
    destination: run.destination
      ? {
          type: run.destination.type,
          code: run.destination.code,
          name: run.destination.name,
          fingerprint: run.destination.fingerprint,
          questionCount: run.destination.questions?.length || 0,
        }
      : null,
    profile: structuredClone(run.profile),
    mappingCounts: {
      total: run.mappings.length,
      approved: run.mappings.filter((mapping) => mapping.status === "approved").length,
      review: run.mappings.filter((mapping) => mapping.status === "review").length,
      unmapped: run.mappings.filter((mapping) => mapping.status === "unmapped").length,
      excluded: run.mappings.filter((mapping) => mapping.status === "excluded").length,
    },
    validation: run.validation
      ? {
          exportable: run.validation.exportable,
          errors: run.validation.errors,
          warnings: run.validation.warnings,
          validResponses: run.validation.validResponses,
        }
      : null,
    recordCount: run.records?.length || 0,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    processedAt: run.processedAt || null,
  };
}

function createDatasetCode(metadata, sourceSha256) {
  const words = (metadata.program || "Dataset").match(/[A-Za-z0-9]+/g) || ["Dataset"];
  const prefix = words.map((word) => word[0]).join("").slice(0, 6).toUpperCase();
  const suffix = [metadata.year, metadata.round]
    .filter(Boolean)
    .join("-")
    .replace(/[^A-Za-z0-9-]/g, "")
    .slice(0, 20);
  return suffix
    ? `${prefix}-${suffix}`
    : `${prefix}-${sourceSha256.slice(0, 8).toUpperCase()}`;
}

function sha256Json(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validateScale(scale, name) {
  if (!scale || typeof scale !== "object") {
    throw new WorkflowError(400, `${name} is required for numeric transformations.`);
  }
  const min = Number(scale.min);
  const max = Number(scale.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    throw new WorkflowError(400, `${name} must contain numeric min and max values.`);
  }
  return { min, max };
}

function validateRuleInput(input, { existing } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new WorkflowError(400, "A rule object is required.");
  }
  const ruleId = existing?.ruleId || String(input.ruleId || "").trim();
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(ruleId)) {
    throw new WorkflowError(400, "ruleId must use 3-64 uppercase letters, numbers or underscores.");
  }
  const name = String(input.name ?? existing?.name ?? "").trim();
  if (!name || name.length > 120) {
    throw new WorkflowError(400, "Rule name is required and must be 120 characters or fewer.");
  }
  const transformType = input.transformType ?? existing?.transformType;
  if (!TRANSFORM_TYPES.includes(transformType)) {
    throw new WorkflowError(400, `transformType must be one of: ${TRANSFORM_TYPES.join(", ")}.`);
  }
  const status = input.status ?? existing?.status ?? "draft";
  if (!["draft", "approved", "retired"].includes(status)) {
    throw new WorkflowError(400, "Rule status must be draft, approved or retired.");
  }

  const rule = {
    ruleId,
    name,
    transformType,
    status,
    decimals: Number.isInteger(Number(input.decimals ?? existing?.decimals))
      ? Math.min(10, Math.max(0, Number(input.decimals ?? existing?.decimals)))
      : 2,
    notes: String(input.notes ?? existing?.notes ?? "").trim().slice(0, 1_000),
  };

  if (["linear", "reverse"].includes(transformType)) {
    rule.sourceScale = validateScale(input.sourceScale ?? existing?.sourceScale, "sourceScale");
    rule.targetScale = validateScale(input.targetScale ?? existing?.targetScale, "targetScale");
  }
  if (transformType === "categoricalMap") {
    const valueMap = input.valueMap ?? existing?.valueMap;
    if (!valueMap || typeof valueMap !== "object" || Array.isArray(valueMap)) {
      throw new WorkflowError(400, "valueMap is required for a categorical map.");
    }
    const entries = Object.entries(valueMap);
    if (!entries.length || entries.length > 100) {
      throw new WorkflowError(400, "valueMap must contain between 1 and 100 mappings.");
    }
    rule.valueMap = Object.fromEntries(
      entries.map(([key, value]) => {
        const safeKey = String(key).trim();
        if (!safeKey || safeKey.length > 120 || ["__proto__", "constructor", "prototype"].includes(safeKey)) {
          throw new WorkflowError(400, "valueMap contains an unsupported category.");
        }
        if (!["string", "number", "boolean"].includes(typeof value)) {
          throw new WorkflowError(400, "Mapped values must be strings, numbers or booleans.");
        }
        return [safeKey, value];
      }),
    );
  }
  return rule;
}

class RunService {
  constructor({ store, hmacSecret }) {
    this.store = store;
    this.hmacSecret = hmacSecret;
  }

  createRun(buffer, originalName, metadataInput = {}, destinationFile = null) {
    const metadata = cleanMetadata(metadataInput);
    const parsed = parseDatasetBuffer(buffer, originalName);
    if (!parsed.rows.length) {
      throw new WorkflowError(400, "The dataset must contain at least one response row.");
    }
    const detectedProfile = profileRows(parsed.rows);
    const now = new Date().toISOString();
    const id = `run-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const state = this.store.read();
    const destination = destinationFile
      ? createDestinationFromDataset(destinationFile.buffer, destinationFile.originalName)
      : createBuiltInDestination();
    const mappings = suggestMappings(
      detectedProfile.questionColumns,
      destination.questions,
      detectedProfile,
    ).map(
      (mapping) => {
        const target = destination.questions.find(
          (question) => question.code === mapping.targetQuestionCode,
        );
        return {
          ...mapping,
          domain: target?.domain || null,
          construct: target?.construct || null,
          reverseScored: target?.reverseScored === true,
          responseType: target?.responseType || null,
          ruleVersion: mapping.ruleId
            ? latestRule(state.rules, mapping.ruleId)?.version || null
            : null,
        };
      },
    );
    const protectedColumns = new Set([
      ...detectedProfile.identifierColumns,
      ...(detectedProfile.sensitiveColumns || []),
      ...detectedProfile.metadataColumns,
    ]);
    const sourceRows = parsed.rows.map((sourceRow, rowIndex) => {
      const identifier = detectedProfile.identifierColumns
        .map((column) => String(sourceRow[column] ?? "").trim())
        .filter(Boolean)
        .join("|");
      const pseudonymSource = identifier || `${id}|anonymous-row|${rowIndex + 2}`;
      const row = Object.fromEntries(
        Object.entries(sourceRow).filter(
          ([column]) => !protectedColumns.has(column),
        ),
      );
      return { ...row, __personId: hmacIdentifier(this.hmacSecret, pseudonymSource) };
    });
    const profile = {
      ...detectedProfile,
      preview: parsed.rows.slice(0, 20).map((sourceRow, rowIndex) =>
        Object.fromEntries(
          parsed.headers.map((column) => [
            column,
            detectedProfile.identifierColumns.includes(column)
              ? `person-${sourceRows[rowIndex].__personId.slice(0, 16)}`
              : (detectedProfile.sensitiveColumns || []).includes(column)
                ? "[restricted]"
                : detectedProfile.metadataColumns.includes(column)
                  ? "[metadata hidden]"
                  : sourceRow[column],
          ]),
        ),
      ),
    };
    const sourceSha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const source = {
      originalName: originalName.slice(0, 250),
      storedName: null,
      size: buffer.length,
      type: parsed.format,
      worksheetName: parsed.worksheetName,
      sha256: sourceSha256,
      checksum: sourceSha256,
    };
    const run = {
      id,
      datasetCode: createDatasetCode(metadata, sourceSha256),
      stage: mappings.every((mapping) => mapping.status === "approved")
        ? "ready_to_process"
        : "mapping",
      metadata,
      source,
      destination,
      profile,
      mappings,
      sourceRows,
      records: [],
      validation: null,
      createdAt: now,
      updatedAt: now,
      processedAt: null,
      configurationHash: null,
      resultHash: null,
    };
    this.store.mutate((nextState) => {
      nextState.runs = [...nextState.runs, run];
      return run;
    });
    return withoutInternalRows(run);
  }

  createDemoRun() {
    const csv = [
      "Email,Name,How confident are you as a leader?,The program built my network,I can influence positive change,Any other comments?",
      "alex@example.com,Alex,4,5,4,Strong peer connections",
      "casey@example.com,Casey,3,4,5,More regional sessions",
      "jordan@example.com,Jordan,5,4,4,",
    ].join("\n");
    const run = this.createRun(Buffer.from(csv, "utf8"), "tasmanian-leaders-demo.csv", {
      program: "Tasmanian Leaders Program",
      year: "2026",
      round: "Demo",
      qualityTier: "tier1",
    });
    return this.processRun(run.id);
  }

  listRuns() {
    return this.store
      .read()
      .runs.map(runSummary)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  getRun(id) {
    const run = this.store.read().runs.find((candidate) => candidate.id === id);
    if (!run) throw new WorkflowError(404, "Harmonisation run not found.");
    return withoutInternalRows(run);
  }

  getInternalRun(id) {
    const run = this.store.read().runs.find((candidate) => candidate.id === id);
    if (!run) throw new WorkflowError(404, "Harmonisation run not found.");
    return run;
  }

  updateMapping(id, input) {
    if (!input || typeof input !== "object") {
      throw new WorkflowError(400, "A mapping update is required.");
    }
    const sourceQuestion = String(input.sourceQuestion || "").trim();
    if (!sourceQuestion) throw new WorkflowError(400, "sourceQuestion is required.");
    const allowedStatuses = ["approved", "review", "unmapped", "excluded"];
    if (!allowedStatuses.includes(input.status)) {
      throw new WorkflowError(400, `status must be one of: ${allowedStatuses.join(", ")}.`);
    }

    return this.store.mutate((state) => {
      const runIndex = state.runs.findIndex((candidate) => candidate.id === id);
      if (runIndex < 0) throw new WorkflowError(404, "Harmonisation run not found.");
      const run = state.runs[runIndex];
      const mappingIndex = run.mappings.findIndex(
        (mapping) => mapping.sourceQuestion === sourceQuestion,
      );
      if (mappingIndex < 0) throw new WorkflowError(404, "Source question mapping not found.");

      let target = null;
      let ruleId = null;
      if (!["unmapped", "excluded"].includes(input.status)) {
        target = (run.destination?.questions || state.targetQuestions).find(
          (question) => question.code === String(input.targetQuestionCode || "").trim(),
        );
        if (!target) throw new WorkflowError(400, "A valid targetQuestionCode is required.");
        ruleId = String(input.ruleId || target.defaultRuleId || "").trim();
        if (!state.rules.some((rule) => rule.ruleId === ruleId && rule.status === "approved")) {
          throw new WorkflowError(400, "A valid approved ruleId is required.");
        }
      }

      const previous = run.mappings[mappingIndex];
      const nextMapping = {
        ...previous,
        targetQuestionCode: target?.code || null,
        targetQuestion: target?.label || null,
        domain: target?.domain || null,
        construct: target?.construct || null,
        reverseScored: target?.reverseScored === true,
        responseType: target?.responseType || null,
        status: input.status,
        ruleId,
        ruleVersion: ruleId ? latestRule(state.rules, ruleId)?.version || null : null,
        method: input.status === "approved" ? "manual" : previous.method,
        confidence: input.status === "approved" ? 1 : previous.confidence,
        confidenceBand: input.status === "approved" ? "high" : previous.confidenceBand,
        updatedAt: new Date().toISOString(),
      };
      const mappings = run.mappings.map((mapping, index) =>
        index === mappingIndex ? nextMapping : mapping,
      );
      const updatedRun = {
        ...run,
        mappings,
        stage: mappings.every((mapping) => ["approved", "excluded"].includes(mapping.status))
          ? "ready_to_process"
          : "mapping",
        records: [],
        validation: null,
        processedAt: null,
        configurationHash: null,
        resultHash: null,
        updatedAt: new Date().toISOString(),
      };
      state.runs = state.runs.map((candidate, index) =>
        index === runIndex ? updatedRun : candidate,
      );

      if (input.status === "approved" && target && run.destination?.type !== "uploaded") {
        state.targetQuestions = state.targetQuestions.map((question) =>
          question.code === target.code &&
          !(question.aliases || []).some((alias) => alias === sourceQuestion)
            ? { ...question, aliases: [...(question.aliases || []), sourceQuestion] }
            : question,
        );
      }
      return withoutInternalRows(updatedRun);
    });
  }

  processRun(id) {
    return this.store.mutate((state) => {
      const runIndex = state.runs.findIndex((candidate) => candidate.id === id);
      if (runIndex < 0) throw new WorkflowError(404, "Harmonisation run not found.");
      const run = state.runs[runIndex];
      const transformed = harmoniseRows({
        runId: run.id,
        rows: run.sourceRows,
        identifierColumns: run.profile.identifierColumns,
        mappings: run.mappings,
        rules: state.rules,
        hashIdentifier: (identifier, row, rowIndex) =>
          row.__personId || hmacIdentifier(this.hmacSecret, identifier || `${run.id}|${rowIndex + 2}`),
      });
      const validation = validateRun({
        identifierColumns: run.profile.identifierColumns,
        mappings: run.mappings,
        records: transformed.records,
        duplicateCount: run.profile.duplicateCount,
      });
      const now = new Date().toISOString();
      const configurationHash = sha256Json({
        metadata: run.metadata,
        destinationFingerprint: run.destination?.fingerprint || null,
        mappings: run.mappings.map((mapping) => ({
          sourceQuestion: mapping.sourceQuestion,
          targetQuestionCode: mapping.targetQuestionCode,
          status: mapping.status,
          ruleId: mapping.ruleId,
          ruleVersion: mapping.ruleVersion,
          rule: selectedRule(state.rules, mapping) || null,
        })),
      });
      const resultHash = sha256Json(
        transformed.records.map(({ runId, ...record }) => record),
      );
      const updatedRun = {
        ...run,
        records: transformed.records,
        validation,
        stage: validation.exportable ? "exportable" : "validation",
        processedAt: now,
        updatedAt: now,
        configurationHash,
        resultHash,
      };
      state.runs = state.runs.map((candidate, index) =>
        index === runIndex ? updatedRun : candidate,
      );
      return withoutInternalRows(updatedRun);
    });
  }

  listRules() {
    return this.store
      .read()
      .rules.sort((left, right) =>
        left.ruleId === right.ruleId
          ? versionNumber(left.version) - versionNumber(right.version)
          : left.ruleId.localeCompare(right.ruleId),
      );
  }

  createRule(input) {
    const validated = validateRuleInput(input);
    return this.store.mutate((state) => {
      if (state.rules.some((rule) => rule.ruleId === validated.ruleId)) {
        throw new WorkflowError(409, "A rule with this ruleId already exists; create a new version instead.");
      }
      const now = new Date().toISOString();
      const rule = { ...validated, version: "v1", createdAt: now, updatedAt: now, builtIn: false };
      state.rules = [...state.rules, rule];
      return rule;
    });
  }

  createRuleVersion(ruleId, input) {
    return this.store.mutate((state) => {
      const versions = state.rules
        .filter((rule) => rule.ruleId === ruleId)
        .sort((left, right) => versionNumber(right.version) - versionNumber(left.version));
      if (!versions.length) throw new WorkflowError(404, "Rule not found.");
      const current = versions[0];
      const validated = validateRuleInput(input, { existing: current });
      const now = new Date().toISOString();
      const rule = {
        ...validated,
        version: `v${versionNumber(current.version) + 1}`,
        createdAt: now,
        updatedAt: now,
        builtIn: false,
      };
      state.rules = [...state.rules, rule];
      return rule;
    });
  }

  targetQuestions() {
    return this.store.read().targetQuestions;
  }

  overview() {
    const state = this.store.read();
    const summaries = state.runs.map(runSummary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const uniqueDatasets = new Set(state.runs.map((run) => run.source.sha256)).size;
    const questionVariants = new Set(
      state.runs.flatMap((run) => run.mappings.map((mapping) => mapping.sourceQuestion)),
    ).size;
    const activeValidationWarnings = state.runs.reduce(
      (total, run) => total + (run.validation?.warnings || 0) + (run.validation?.errors || 0),
      0,
    );
    const readyForExport = state.runs.filter((run) => run.stage === "exportable").length;
    return {
      totalRuns: state.runs.length,
      uniqueDatasets,
      normalisedQuestionVariants: questionVariants,
      activeValidationWarnings,
      readyForExport,
      latestRun: summaries[0] || null,
      recentRuns: summaries.slice(0, 5),
      stageCounts: state.runs.reduce(
        (counts, run) => ({ ...counts, [run.stage]: (counts[run.stage] || 0) + 1 }),
        {},
      ),
    };
  }
}

module.exports = {
  RunService,
  WorkflowError,
  cleanMetadata,
  hmacIdentifier,
  runSummary,
  validateRuleInput,
  withoutInternalRows,
};
