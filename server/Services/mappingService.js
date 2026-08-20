const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "do",
  "does",
  "for",
  "helped",
  "how",
  "i",
  "is",
  "me",
  "my",
  "of",
  "the",
  "to",
  "was",
  "what",
  "with",
  "you",
  "your",
]);

function normaliseQuestion(question) {
  return String(question ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-AU")
    .replace(/programme/g, "program")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stemToken(token) {
  if (token === "built") return "build";
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("s") && token.length > 4) return token.slice(0, -1);
  return token;
}

function tokens(question) {
  return new Set(
    normaliseQuestion(question)
      .split(" ")
      .filter((token) => token && !STOP_WORDS.has(token))
      .map(stemToken),
  );
}

function tokenSimilarity(left, right) {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return intersection / union;
}

function aliasesFor(target) {
  return [target.label, ...(target.aliases || [])];
}

function inferRuleId(target, sourceQuestion, profile) {
  const scale = profile?.columns?.[sourceQuestion]?.detectedScale;
  if (scale && scale.min === 1 && scale.max === 7) return "SCALE_1_7_TO_100";
  if (scale && scale.min === 1 && scale.max === 10) return "SCALE_1_10_TO_100";
  return target.defaultRuleId || (profile?.columns?.[sourceQuestion]?.kind === "text"
    ? "TEXT_IDENTITY"
    : "SCALE_1_5_TO_100");
}

function approvedMapping(sourceQuestion, target, method, profile) {
  const sourceColumn = profile?.columns?.[sourceQuestion];
  const sourceScale = sourceColumn?.detectedScale;
  const targetScale = target?.targetScale;
  const exceedsTargetScale =
    sourceScale &&
    targetScale &&
    (Number(sourceScale.min) < Number(targetScale.min) ||
      Number(sourceScale.max) > Number(targetScale.max));
  const incompatibleKind =
    target?.expectedKind &&
    sourceColumn?.kind &&
    target.expectedKind !== "empty" &&
    sourceColumn.kind !== "empty" &&
    target.expectedKind !== sourceColumn.kind;
  const needsDestinationReview = exceedsTargetScale || incompatibleKind;
  return {
    sourceQuestion,
    targetQuestionCode: target.code,
    targetQuestion: target.label,
    confidence: 1,
    confidenceBand: "high",
    method: needsDestinationReview ? `${method}_scale_review` : method,
    status: needsDestinationReview ? "review" : "approved",
    ruleId: inferRuleId(target, sourceQuestion, profile),
  };
}

function suggestMapping(sourceQuestion, targetQuestions, profile) {
  const normalisedSource = normaliseQuestion(sourceQuestion);

  for (const target of targetQuestions) {
    if (normaliseQuestion(target.label) === normalisedSource) {
      return approvedMapping(sourceQuestion, target, "exact", profile);
    }
    if ((target.aliases || []).some((alias) => normaliseQuestion(alias) === normalisedSource)) {
      return approvedMapping(sourceQuestion, target, "alias", profile);
    }
  }

  let best = null;
  for (const target of targetQuestions) {
    const confidence = Math.max(
      ...aliasesFor(target).map((candidate) => tokenSimilarity(sourceQuestion, candidate)),
    );
    if (!best || confidence > best.confidence) best = { target, confidence };
  }

  if (!best || best.confidence < 0.4) {
    return {
      sourceQuestion,
      targetQuestionCode: null,
      targetQuestion: null,
      confidence: Number((best?.confidence || 0).toFixed(2)),
      confidenceBand: "low",
      method: "none",
      status: "unmapped",
      ruleId: null,
    };
  }

  const confidence = Number(best.confidence.toFixed(2));
  return {
    sourceQuestion,
    targetQuestionCode: best.target.code,
    targetQuestion: best.target.label,
    confidence,
    confidenceBand: confidence >= 0.7 ? "medium" : "low",
    method: "similarity",
    status: "review",
    ruleId: inferRuleId(best.target, sourceQuestion, profile),
  };
}

function suggestMappings(sourceQuestions, targetQuestions, profile) {
  return sourceQuestions.map((sourceQuestion) =>
    suggestMapping(sourceQuestion, targetQuestions, profile),
  );
}

module.exports = {
  normaliseQuestion,
  suggestMapping,
  suggestMappings,
  tokenSimilarity,
};
