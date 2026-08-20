function issue(severity, code, message, location, recommendation) {
  return { severity, code, message, location, recommendation };
}

function validateRun({ identifierColumns, mappings, records, duplicateCount = 0 }) {
  const issues = [];

  if (!identifierColumns.length) {
    issues.push(
      issue(
        "error",
        "MISSING_IDENTIFIER",
        "No email, name, participant or respondent identifier was detected.",
        "dataset",
        "Add or identify a person identifier before export.",
      ),
    );
  }

  for (const mapping of mappings) {
    if (mapping.status === "excluded") continue;
    if (mapping.status === "unmapped" || !mapping.targetQuestionCode) {
      issues.push(
        issue(
          "error",
          "UNMAPPED_QUESTION",
          `No target question is approved for "${mapping.sourceQuestion}".`,
          mapping.sourceQuestion,
          "Choose a target question or explicitly exclude the source question.",
        ),
      );
    } else if (mapping.status !== "approved") {
      issues.push(
        issue(
          "error",
          "MAPPING_REQUIRES_REVIEW",
          `The suggested mapping for "${mapping.sourceQuestion}" requires confirmation.`,
          mapping.sourceQuestion,
          "Approve or change the suggested mapping.",
        ),
      );
    }
  }

  const statusDetails = {
    out_of_range: ["error", "OUT_OF_RANGE", "The response is outside the approved source scale."],
    missing_rule: ["error", "MISSING_RULE", "No approved transformation rule is available."],
    invalid_type: ["error", "INVALID_VALUE", "The response is not valid for the selected numeric rule."],
    unmapped_value: ["error", "UNMAPPED_VALUE", "The category has no approved value mapping."],
    missing: ["warning", "MISSING_VALUE", "The response is blank and has been preserved as missing."],
  };

  for (const record of records) {
    const details = statusDetails[record.status];
    if (!details) continue;
    issues.push(
      issue(
        details[0],
        details[1],
        details[2],
        `row ${record.sourceRow}, ${record.sourceColumn}`,
        details[0] === "warning" ? "Review if completeness is required." : "Review the value or rule.",
      ),
    );
  }

  if (duplicateCount > 0) {
    issues.push(
      issue(
        "warning",
        "DUPLICATE_IDENTIFIER",
        `${duplicateCount} repeated identifier record(s) were detected.`,
        "dataset",
        "Confirm whether repeated responses are expected.",
      ),
    );
  }

  const errors = issues.filter((item) => item.severity === "error").length;
  const warnings = issues.filter((item) => item.severity === "warning").length;
  return {
    exportable: errors === 0,
    errors,
    warnings,
    validResponses: records.filter((record) => record.status === "valid").length,
    issues,
  };
}

module.exports = { validateRun };
