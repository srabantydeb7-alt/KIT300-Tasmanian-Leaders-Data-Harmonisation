const { isMissing } = require("./profileService");

const TRANSFORM_TYPES = Object.freeze([
  "identity",
  "linear",
  "reverse",
  "categoricalMap",
]);

function rounded(value, decimals = 2) {
  const places = Number.isInteger(decimals) && decimals >= 0 && decimals <= 10
    ? decimals
    : 2;
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function numericScale(rule) {
  const sourceMin = Number(rule?.sourceScale?.min);
  const sourceMax = Number(rule?.sourceScale?.max);
  const targetMin = Number(rule?.targetScale?.min);
  const targetMax = Number(rule?.targetScale?.max);
  if (
    ![sourceMin, sourceMax, targetMin, targetMax].every(Number.isFinite) ||
    sourceMin >= sourceMax ||
    targetMin >= targetMax
  ) {
    return null;
  }
  return { sourceMin, sourceMax, targetMin, targetMax };
}

function applyTransformation(originalValue, rule) {
  if (isMissing(originalValue)) return { value: null, status: "missing" };
  if (!rule || !TRANSFORM_TYPES.includes(rule.transformType)) {
    return { value: null, status: "missing_rule" };
  }

  if (rule.transformType === "identity") {
    return { value: originalValue, status: "valid" };
  }

  if (rule.transformType === "categoricalMap") {
    const valueMap = rule.valueMap && typeof rule.valueMap === "object" ? rule.valueMap : {};
    const exactKey = Object.keys(valueMap).find(
      (key) => key.toLowerCase() === String(originalValue).trim().toLowerCase(),
    );
    return exactKey === undefined
      ? { value: null, status: "unmapped_value" }
      : { value: valueMap[exactKey], status: "valid" };
  }

  const scale = numericScale(rule);
  const sourceValue = Number(String(originalValue).trim());
  if (!scale || !Number.isFinite(sourceValue)) {
    return { value: null, status: "invalid_type" };
  }
  if (sourceValue < scale.sourceMin || sourceValue > scale.sourceMax) {
    return { value: null, status: "out_of_range" };
  }

  const input = rule.transformType === "reverse"
    ? scale.sourceMin + scale.sourceMax - sourceValue
    : sourceValue;
  const converted =
    scale.targetMin +
    ((input - scale.sourceMin) * (scale.targetMax - scale.targetMin)) /
      (scale.sourceMax - scale.sourceMin);
  return { value: rounded(converted, rule.decimals), status: "valid" };
}

function versionNumber(version) {
  const match = /^v(\d+)$/.exec(String(version));
  return match ? Number(match[1]) : 0;
}

function latestRule(rules, ruleId) {
  return rules
    .filter((rule) => rule.ruleId === ruleId && rule.status === "approved")
    .sort((left, right) => versionNumber(right.version) - versionNumber(left.version))[0];
}

function selectedRule(rules, mapping) {
  if (mapping.ruleVersion) {
    return rules.find(
      (rule) => rule.ruleId === mapping.ruleId && rule.version === mapping.ruleVersion,
    );
  }
  return latestRule(rules, mapping.ruleId);
}

function harmoniseRows({
  runId,
  rows,
  identifierColumns,
  mappings,
  rules,
  hashIdentifier,
}) {
  const records = [];
  const ignored = [];

  rows.forEach((row, rowIndex) => {
    const identifier = identifierColumns
      .map((column) => String(row[column] ?? "").trim())
      .filter(Boolean)
      .join("|");
    const personId = row.__personId || hashIdentifier(identifier, row, rowIndex);

    for (const mapping of mappings) {
      if (mapping.status !== "approved" || !mapping.targetQuestionCode) {
        ignored.push({ sourceRow: rowIndex + 2, sourceQuestion: mapping.sourceQuestion });
        continue;
      }

      const rule = selectedRule(rules, mapping);
      const originalValue = row[mapping.sourceQuestion] ?? "";
      const transformed = applyTransformation(originalValue, rule);
      records.push({
        runId,
        personId,
        sourceRow: rowIndex + 2,
        sourceColumn: mapping.sourceQuestion,
        originalQuestion: mapping.sourceQuestion,
        originalValue,
        targetQuestionCode: mapping.targetQuestionCode,
        targetQuestion: mapping.targetQuestion,
        harmonisedValue: transformed.value,
        status: transformed.status,
        ruleId: mapping.ruleId,
        ruleVersion: rule?.version || null,
        ...(mapping.domain ? { domain: mapping.domain } : {}),
        ...(mapping.construct ? { construct: mapping.construct } : {}),
        ...(mapping.responseType ? { responseType: mapping.responseType } : {}),
        ...(mapping.reverseScored === true ? { reverseScored: true } : {}),
      });
    }
  });

  return { records, ignored };
}

module.exports = {
  TRANSFORM_TYPES,
  applyTransformation,
  harmoniseRows,
  latestRule,
  selectedRule,
  versionNumber,
};
