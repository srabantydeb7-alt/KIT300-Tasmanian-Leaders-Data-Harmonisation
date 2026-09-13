const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_RULES,
  ELF_TEMPLATE,
  TARGET_QUESTIONS,
} = require("../Services/questionLibrary");

test("ships the supplied ELF as a complete, metadata-rich destination template", () => {
  assert.equal(ELF_TEMPLATE.code, "ELF_2024_DRAFT_0_1");
  assert.equal(ELF_TEMPLATE.domains.length, 3);
  assert.deepEqual(
    ELF_TEMPLATE.domains.map((domain) => domain.name),
    ["Insight", "Influence", "Impact"],
  );

  const constructs = new Set(
    ELF_TEMPLATE.questions.map((question) => question.construct).filter(Boolean),
  );
  assert.equal(constructs.size, 17);
  assert.ok(ELF_TEMPLATE.questions.length >= 43);
  assert.ok(ELF_TEMPLATE.questions.every((question) => question.framework === ELF_TEMPLATE.code));
});

test("maps real Gravity Forms ELF wording without inventing a scoring model", () => {
  const item = TARGET_QUESTIONS.find(
    (question) => question.code === "ELF_INS_SELF_AWARENESS_01",
  );
  assert.ok(item);
  assert.equal(item.domain, "Insight");
  assert.equal(item.construct, "Self-awareness");
  assert.equal(item.reverseScored, false);
  assert.equal(item.defaultRuleId, "ELF_LIKERT_7_CANONICAL");
  assert.ok(
    item.aliases.includes(
      "To what extent do you agree with the following statements (I have a very good understanding of why I do the things I do.)",
    ),
  );

  const reversed = TARGET_QUESTIONS.find(
    (question) => question.code === "ELF_INS_SELF_AWARENESS_02",
  );
  assert.equal(reversed.reverseScored, true);
  assert.equal(reversed.defaultRuleId, "ELF_LIKERT_7_CANONICAL");

  const rule = DEFAULT_RULES.find(
    (candidate) => candidate.ruleId === "ELF_LIKERT_7_CANONICAL",
  );
  assert.equal(rule.transformType, "categoricalMap");
  assert.equal(rule.valueMap["Strongly agree"], "Strongly agree");
  assert.equal(rule.valueMap["Strongly disagree"], "Strongly disagree");
  assert.equal(Object.values(rule.valueMap).some((value) => typeof value === "number"), false);
});

test("distinguishes genuine NPS from binary recommendation questions", () => {
  const nps = TARGET_QUESTIONS.find((question) => question.code === "PROGRAM_NPS_0_10");
  const recommendation = TARGET_QUESTIONS.find(
    (question) => question.code === "PROGRAM_RECOMMEND_BINARY",
  );
  assert.equal(nps.responseType, "numeric_rating");
  assert.equal(nps.defaultRuleId, "NPS_0_10_CANONICAL");
  assert.equal(recommendation.responseType, "binary");
  assert.notEqual(recommendation.defaultRuleId, nps.defaultRuleId);
});
