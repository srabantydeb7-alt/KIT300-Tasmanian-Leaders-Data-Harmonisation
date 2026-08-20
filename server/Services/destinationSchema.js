const crypto = require("node:crypto");

const { parseDatasetBuffer } = require("./fileParser");
const { profileRows } = require("./profileService");
const { ELF_TEMPLATE, TARGET_QUESTIONS } = require("./questionLibrary");

class DestinationSchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = "DestinationSchemaError";
    this.status = 400;
  }
}

function fingerprint(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function schemaCode(label) {
  return `DST_${crypto
    .createHash("sha256")
    .update(String(label).normalize("NFKC"))
    .digest("hex")
    .slice(0, 16)
    .toUpperCase()}`;
}

function responseType(column) {
  if (column.kind === "number") return "continuous";
  if (column.kind === "boolean") return "binary";
  if (column.kind === "date") return "date";
  if (column.kind === "empty") return "unknown";
  return "categorical_or_text";
}

function customQuestion(label, column) {
  const question = {
    code: schemaCode(label),
    label,
    aliases: [label],
    responseType: responseType(column),
    expectedKind: column.kind,
    defaultRuleId: column.kind === "boolean" ? "BINARY_CANONICAL" : "VALUE_IDENTITY",
  };
  if (column.detectedScale) question.targetScale = structuredClone(column.detectedScale);
  if (column.kind === "boolean") question.allowedValues = ["Yes", "No"];
  return question;
}

function createBuiltInDestination() {
  const metadataHeaders = [
    "person_id",
    "program",
    "program_stream",
    "cohort_year",
    "survey_stage",
    "respondent_type",
  ];
  const questions = TARGET_QUESTIONS.map((question) => structuredClone(question));
  const headers = [...metadataHeaders, ...questions.map((question) => question.label)];
  const snapshot = {
    type: "built_in",
    code: ELF_TEMPLATE.code,
    name: ELF_TEMPLATE.name,
    frameworkVersion: ELF_TEMPLATE.frameworkVersion,
    headers,
    identifierColumns: ["person_id"],
    metadataColumns: metadataHeaders.slice(1),
    questions,
    scoringStatus: ELF_TEMPLATE.scoringStatus,
  };
  return { ...snapshot, fingerprint: fingerprint(snapshot) };
}

function createDestinationFromDataset(buffer, originalName) {
  let parsed;
  try {
    parsed = parseDatasetBuffer(buffer, originalName);
  } catch (error) {
    throw new DestinationSchemaError(`The destination schema could not be read: ${error.message}`);
  }
  if (!parsed.rows.length) {
    throw new DestinationSchemaError(
      "The destination must contain at least one representative row so types and scales can be inferred.",
    );
  }

  const profile = profileRows(parsed.rows);
  if (!profile.questionColumns.length) {
    throw new DestinationSchemaError(
      "The destination does not contain any target question or measure columns.",
    );
  }
  const questions = profile.questionColumns.map((label) =>
    customQuestion(label, profile.columns[label]),
  );
  const snapshot = {
    type: "uploaded",
    code: `CUSTOM_${fingerprint(parsed.headers).slice(0, 12).toUpperCase()}`,
    name: originalName.slice(0, 250),
    format: parsed.format,
    worksheetName: parsed.worksheetName,
    headers: [...parsed.headers],
    identifierColumns: [...profile.identifierColumns],
    metadataColumns: [...profile.metadataColumns],
    questions,
    sourceChecksum: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
  return { ...snapshot, fingerprint: fingerprint(snapshot) };
}

module.exports = {
  DestinationSchemaError,
  createBuiltInDestination,
  createDestinationFromDataset,
  fingerprint,
  schemaCode,
};
