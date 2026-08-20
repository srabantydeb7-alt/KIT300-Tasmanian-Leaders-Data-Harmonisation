const ELF_CODE = "ELF_2024_DRAFT_0_1";

const ELF_DOMAINS = Object.freeze([
  { name: "Insight", order: 1 },
  { name: "Influence", order: 2 },
  { name: "Impact", order: 3 },
]);

function wrapped(statement) {
  return `To what extent do you agree with the following statements (${statement})`;
}

function elfItem({ code, label, domain, construct, reverseScored = false, aliases = [], respondentType = "participant" }) {
  return {
    code,
    label,
    aliases,
    framework: ELF_CODE,
    frameworkVersion: "Draft 0.1 · 18 January 2024",
    domain,
    construct,
    respondentType,
    responseType: "ordinal",
    reverseScored,
    defaultRuleId: "ELF_LIKERT_7_CANONICAL",
  };
}

const ELF_PARTICIPANT_ITEMS = [
  elfItem({ code: "ELF_INS_SELF_AWARENESS_01", label: "I have a very good understanding of why I do the things I do.", domain: "Insight", construct: "Self-awareness", aliases: [wrapped("I have a very good understanding of why I do the things I do.")] }),
  elfItem({ code: "ELF_INS_SOCIAL_AWARENESS_02", label: "It is difficult for me to understand why people feel the way they do.", domain: "Insight", construct: "Social awareness", reverseScored: true, aliases: [wrapped("It is difficult for me to understand why people feel the way they do.")] }),
  elfItem({ code: "ELF_INS_CLARITY_PURPOSE_01", label: "I change my mind frequently.", domain: "Insight", construct: "Clarity of purpose", reverseScored: true, aliases: [wrapped("I change my mind frequently.")] }),
  elfItem({ code: "ELF_INS_SITUATIONAL_AWARENESS_01", label: "Right now, I am conscious of all objects around me.", domain: "Insight", construct: "Situational awareness", aliases: [wrapped("Right now, I am conscious of all objects around me.")] }),
  elfItem({ code: "ELF_INS_SELF_AWARENESS_02", label: "I am often confused about my feelings.", domain: "Insight", construct: "Self-awareness", reverseScored: true, aliases: [wrapped("I am often confused about my feelings.")] }),
  elfItem({ code: "ELF_INS_CLARITY_PURPOSE_02", label: "Before action, I have a clear idea of what I am going to do next.", domain: "Insight", construct: "Clarity of purpose", aliases: [wrapped("Before action, I have a clear idea of what I am going to do next."), "I have a clear idea of how projects will be completed."] }),
  elfItem({ code: "ELF_INS_SELF_COMPASSION_01", label: "I regularly remind myself that failure and challenges are part of the human experience.", domain: "Insight", construct: "Self-compassion", aliases: [wrapped("I regularly remind myself that failure and challenges are part of the human experience.")] }),
  elfItem({ code: "ELF_INS_SITUATIONAL_AWARENESS_02", label: "Right now, I am keenly aware of everything in my environment.", domain: "Insight", construct: "Situational awareness", aliases: [wrapped("Right now, I am keenly aware of everything in my environment.")] }),
  elfItem({ code: "ELF_INS_STRATEGIC_FORESIGHT_02", label: "Most of my objectives are focused on achieving targets due in the next six months.", domain: "Insight", construct: "Strategic foresight", reverseScored: true, aliases: [wrapped("Most of my objectives are focused on achieving targets due in the next six months.")] }),
  elfItem({ code: "ELF_INS_BALANCED_PROCESSING_01", label: "I am very uncomfortable objectively considering my limitations and shortcomings.", domain: "Insight", construct: "Balanced processing", reverseScored: true, aliases: [wrapped("I am very uncomfortable objectively considering my limitations and shortcomings.")] }),
  elfItem({ code: "ELF_INS_BALANCED_PROCESSING_02", label: "I often deny the validity of any compliments that I receive.", domain: "Insight", construct: "Balanced processing", reverseScored: true, aliases: [wrapped("I often deny the validity of any compliments that I receive.")] }),
  elfItem({ code: "ELF_INS_SELF_COMPASSION_02", label: "In the past seven days I engaged in supportive and comforting self-talk.", domain: "Insight", construct: "Self-compassion", aliases: [wrapped("In the past seven days I engaged in supportive and comforting self-talk")] }),
  elfItem({ code: "ELF_INS_BALANCED_PROCESSING_03", label: "I always solicit views of others before making decisions.", domain: "Insight", construct: "Balanced processing", aliases: [wrapped("I always solicit views of others before making decisions.")] }),
  elfItem({ code: "ELF_INS_SOCIAL_AWARENESS_01", label: "I can tell how people are feeling by listening to the tone of their voice.", domain: "Insight", construct: "Social awareness", aliases: ["I can tell how people are feeling by listening to the tone of their voice."] }),
  { ...elfItem({ code: "ELF_INS_STRATEGIC_FORESIGHT_01", label: "Percentage of current objectives extending more than two years into the future.", domain: "Insight", construct: "Strategic foresight", aliases: ["What percentage of your current objectives stretch on for more than two years into the future?"] }), responseType: "percentage", defaultRuleId: "PERCENT_0_100_CANONICAL" },
  elfItem({ code: "ELF_INF_AMBIGUITY_01", label: "I like to surround myself with things that are familiar to me.", domain: "Influence", construct: "Tolerance for ambiguity", reverseScored: true, aliases: ["I like to surround myself with things that are familiar to me"] }),
  elfItem({ code: "ELF_INF_AMBIGUITY_02", label: "A good job is one where what and how are always clear.", domain: "Influence", construct: "Tolerance for ambiguity", reverseScored: true, aliases: ["A good job is one where what is to be done and how it is to be done are always clear"] }),
  elfItem({ code: "ELF_INF_COMPLEXITY_01", label: "It would bother me that scientific work is never completed.", domain: "Influence", construct: "Tolerance for complexity", reverseScored: true, aliases: ["If I were a scientist, it would bother me that my work would never be completed (because they always make new discoveries)"] }),
  elfItem({ code: "ELF_INF_COMPLEXITY_02", label: "Good leaders never break the law to achieve a positive outcome.", domain: "Influence", construct: "Tolerance for complexity", aliases: ["Good leaders never break the law to achieve a positive outcome."] }),
  elfItem({ code: "ELF_INF_AMBIGUITY_03", label: "I prefer parties where I know most people.", domain: "Influence", construct: "Tolerance for ambiguity", reverseScored: true, aliases: ["I like parties where I know most of the people more than ones where all or most of the people are complete strangers"] }),
  elfItem({ code: "ELF_INF_COMPLEXITY_03", label: "A good manager waits for every possible piece of information.", domain: "Influence", construct: "Tolerance for complexity", reverseScored: true, aliases: ["A good manager won’t make a decision until they have every possible piece of information about a matter."] }),
  elfItem({ code: "ELF_INF_INFORMAL_INFLUENCE_01", label: "I do not need a position or title to inspire others.", domain: "Influence", construct: "Capacity for informal influence", aliases: ["I don’t need a position or title to inspire others"] }),
  elfItem({ code: "ELF_INF_INFORMAL_INFLUENCE_02", label: "A leadership position is the easiest way to influence others.", domain: "Influence", construct: "Capacity for informal influence", reverseScored: true, aliases: ["Having a leadership position is the easiest way to influence others"] }),
  elfItem({ code: "ELF_INF_NETWORKS_01", label: "I tend to avoid eye contact while waiting near other people.", domain: "Influence", construct: "Networks", reverseScored: true, aliases: ["I tend to avoid eye contact while waiting near other people"] }),
  elfItem({ code: "ELF_INF_COLLABORATION_01", label: "I seek opportunities to meet with colleagues who disagree with me.", domain: "Influence", construct: "Collaboration", aliases: ["I seek opportunities to meet with colleagues who disagree with me"] }),
  elfItem({ code: "ELF_INF_COLLABORATION_02", label: "Managers need to focus on objectives more than team members.", domain: "Influence", construct: "Collaboration", reverseScored: true, aliases: ["Managers need to focus on objectives more than team members"] }),
  elfItem({ code: "ELF_INF_NETWORKS_02", label: "I actively seek deep conversation with new people.", domain: "Influence", construct: "Networks", aliases: ["I will actively seek deep conversation with new people at a social event."] }),
  elfItem({ code: "ELF_INS_SELF_AWARENESS_03", label: "A self-aware leader will always pick up on their own biases.", domain: "Insight", construct: "Self-awareness", aliases: [wrapped("A self-aware leader will always pick up on their own biases.")] }),
  elfItem({ code: "ELF_INF_CREATIVE_DECISION_01", label: "I enjoy the opportunity to create new things.", domain: "Influence", construct: "Creative decision-making", aliases: [wrapped("I enjoy the opportunity to create new things")] }),
  elfItem({ code: "ELF_INF_COMPLEXITY_04", label: "Being unable to predict the future is exciting.", domain: "Influence", construct: "Tolerance for complexity", aliases: [wrapped("Being unable to predict the future is exciting.")] }),
  elfItem({ code: "ELF_INF_CREATIVE_DECISION_02", label: "I frequently imagine new ways of doing and being.", domain: "Influence", construct: "Creative decision-making", aliases: [wrapped("I frequently imagine new ways of doing and being.")] }),
  elfItem({ code: "ELF_INF_COLLABORATION_03", label: "I sometimes make decisions without talking to others.", domain: "Influence", construct: "Collaboration", reverseScored: true, aliases: [wrapped("I sometimes make decisions without talking to others.")] }),
  elfItem({ code: "ELF_INF_CREATIVE_DECISION_03", label: "It is easy to hold multiple possible futures at the same time.", domain: "Influence", construct: "Creative decision-making", aliases: [wrapped("It is easy to hold multiple possible futures at the same time.")] }),
  elfItem({ code: "ELF_INF_CREATIVE_DECISION_04", label: "When making a decision, I usually deploy an existing model first.", domain: "Influence", construct: "Creative decision-making", reverseScored: true, aliases: [wrapped("When I need to make a decision, I usually deploy an existing model first.")] }),
  elfItem({ code: "ELF_IMP_EXTRA_ROLE_01", label: "I volunteer for workplace tasks outside my general scope.", domain: "Impact", construct: "Extra-role behaviours", aliases: ["I volunteer to help my workplace with tasks that need doing that might be out of my general scope."] }),
  elfItem({ code: "ELF_IMP_BELONGING_01", label: "I enable very different friends to build relationships.", domain: "Impact", construct: "Foster belonging", aliases: ["I actively attempt to enable two very different friends of mine to build relationships."] }),
  elfItem({ code: "ELF_IMP_INTRINSIC_MOTIVATION_01", label: "I would emphasise satisfying work over wages when interviewing.", domain: "Impact", construct: "Foster intrinsic motivation", aliases: ["If I were interviewing a new staff member, I would emphasize how satisfying the work can be over wages."] }),
  elfItem({ code: "ELF_IMP_INTRINSIC_MOTIVATION_02", label: "I explain the benefit of a task before asking someone to do it.", domain: "Impact", construct: "Foster intrinsic motivation", aliases: ["I explain the benefit of a task prior to asking someone to do it."] }),
  elfItem({ code: "ELF_IMP_PLACE_ATTACHMENT_01", label: "Tasmania will always be my home, even if I move away.", domain: "Impact", construct: "Place attachment", aliases: ["Tasmania will always be my home, even if I move away."] }),
  elfItem({ code: "ELF_IMP_BELONGING_02", label: "At work, I focus on work rather than quality relationships.", domain: "Impact", construct: "Foster belonging", reverseScored: true, aliases: ["At work, I focus on my work rather than building quality relationships with colleagues."] }),
  elfItem({ code: "ELF_IMP_INTRINSIC_MOTIVATION_03", label: "People around me primarily work for money or promotions.", domain: "Impact", construct: "Foster intrinsic motivation", reverseScored: true, aliases: ["People around me are primarily working for money or promotions."] }),
  elfItem({ code: "ELF_IMP_PLACE_ATTACHMENT_02", label: "I have limited attachment to the city where I live.", domain: "Impact", construct: "Place attachment", reverseScored: true, aliases: ["I have limited attachment to the city I live in."] }),
  elfItem({ code: "ELF_IMP_EXTRA_ROLE_02", label: "At work, I prioritise finishing only my own tasks.", domain: "Impact", construct: "Extra-role behaviours", reverseScored: true, aliases: ["At work, I prioritise on finishing only my own tasks."] }),
];

const MANAGER_ITEMS = [
  ["ELF_MGR_SELF_AWARENESS", "Shows greater emotional consistency in how they respond to workplace situations.", "Insight", "Self-awareness"],
  ["ELF_MGR_CLARITY_PURPOSE", "Has clearer reasoning for their decisions.", "Insight", "Clarity of purpose"],
  ["ELF_MGR_SELF_COMPASSION", "Appears to be less defensive and self-critical when making mistakes.", "Insight", "Self-compassion"],
  ["ELF_MGR_SITUATIONAL_AWARENESS", "Shows increased awareness in meetings and work situations.", "Insight", "Situational awareness"],
  ["ELF_MGR_STRATEGIC_FORESIGHT", "Has a greater focus on short-term goals.", "Insight", "Strategic foresight", true],
  ["ELF_MGR_COLLABORATION", "Engages more openly with colleagues who hold different or opposing views.", "Influence", "Collaboration"],
  ["ELF_MGR_CREATIVE_DECISION", "More often proposes innovative approaches to work.", "Influence", "Creative decision-making"],
  ["ELF_MGR_INFORMAL_INFLUENCE", "Exerts greater positive influence on others beyond their role.", "Influence", "Capacity for informal influence"],
  ["ELF_MGR_NETWORKS", "More deeply engages in conversations with colleagues and clients.", "Influence", "Networks"],
  ["ELF_MGR_AMBIGUITY", "Appears more comfortable working in situations where outcomes are not fully defined.", "Influence", "Tolerance for ambiguity"],
  ["ELF_MGR_COMPLEXITY", "Is more willing to make decisions with complex information.", "Influence", "Tolerance for complexity"],
  ["ELF_MGR_EXTRA_ROLE", "More frequently contributes beyond their core role to support their team.", "Impact", "Extra-role behaviours"],
  ["ELF_MGR_BELONGING", "More often helps build connections between colleagues who might not otherwise interact.", "Impact", "Foster belonging"],
  ["ELF_MGR_INTRINSIC_MOTIVATION", "Has a clearer personal motivation for work beyond salary or benefits.", "Impact", "Foster intrinsic motivation"],
  ["ELF_MGR_PLACE_ATTACHMENT", "Has a stronger sense of commitment to the community.", "Impact", "Place attachment"],
].map(([code, label, domain, construct, reverseScored = false]) => elfItem({ code, label, domain, construct, reverseScored, aliases: [label], respondentType: "manager" }));

const ELF_QUESTIONS = Object.freeze([...ELF_PARTICIPANT_ITEMS, ...MANAGER_ITEMS]);

const PROGRAM_QUESTIONS = [
  { code: "PROGRAM_NPS_0_10", label: "Likelihood to recommend the program (0-10 NPS item)", aliases: ["How likely is it that you would recommend the Tasmanian Leader program you have just completed to a friend or colleague?", "How likely is it that you would recommend the Tasmanian Leaders Program to a friend or colleague?", "How likely is it that you would recommend I-LEAD to a friend or colleague?"], responseType: "numeric_rating", defaultRuleId: "NPS_0_10_CANONICAL" },
  { code: "PROGRAM_RECOMMEND_BINARY", label: "Would recommend the program (binary recommendation)", aliases: ["Would you recommend the program to others?", "Would you recommend the program?"], responseType: "binary", defaultRuleId: "BINARY_CANONICAL" },
  { code: "PROGRAM_SAT", label: "Overall program satisfaction", aliases: ["How satisfied are you with the program?", "How satisfied are you with the programme?", "How would you rate the overall satisfaction with the Tasmanian Leaders?", "How would you rate your overall satisfaction with the Tasmanian Leaders Program?", "Overall program satisfaction"], responseType: "ordinal", defaultRuleId: "SATISFACTION_5_CANONICAL" },
  { code: "PROGRAM_LEADERSHIP_CONFIDENCE_CHANGE", label: "Leadership confidence change after the program", aliases: ["To what extent do you feel more confident in your leadership as a result of the program?"], responseType: "ordinal", defaultRuleId: "VALUE_IDENTITY" },
  { code: "LEAD_CONF", label: "Leadership confidence", aliases: ["How confident are you as a leader?", "I feel confident in my leadership ability", "Leadership confidence"], responseType: "ordinal", defaultRuleId: "SCALE_1_5_TO_100" },
  { code: "NETWORKS", label: "Professional networks", aliases: ["The program built my network", "The programme built my network", "Professional networks"], responseType: "ordinal", defaultRuleId: "SCALE_1_5_TO_100" },
  { code: "COMMUNITY_INFLUENCE", label: "Community influence", aliases: ["I can influence positive change", "Community influence"], responseType: "ordinal", defaultRuleId: "SCALE_1_5_TO_100" },
  { code: "FACILITATOR_QUALITY", label: "Facilitator quality", aliases: ["Rate facilitator effectiveness", "Facilitator quality"], responseType: "ordinal", defaultRuleId: "SCALE_1_5_TO_100" },
  { code: "PROGRAM_DELIVERY", label: "Program delivery quality", aliases: ["Program delivery quality", "Programme delivery quality"], responseType: "ordinal", defaultRuleId: "SCALE_1_5_TO_100" },
  { code: "LEARNING_EXPERIENCE", label: "Learning experience", aliases: ["Learning experience"], responseType: "ordinal", defaultRuleId: "SCALE_1_5_TO_100" },
  { code: "PROGRAM_IMPROVEMENT", label: "Program improvement comment", aliases: ["What changes would improve program?", "What changes would improve the program?", "Program improvement comment"], responseType: "free_text", defaultRuleId: "TEXT_IDENTITY" },
  { code: "OPEN_FEEDBACK", label: "Open feedback", aliases: ["Any other comments?", "Open feedback"], responseType: "free_text", defaultRuleId: "TEXT_IDENTITY" },
];

const LIKERT_7 = Object.freeze({
  "Strongly disagree": "Strongly disagree",
  Disagree: "Disagree",
  "Slightly disagree": "Slightly disagree",
  Neutral: "Neutral",
  "Slightly agree": "Slightly agree",
  Agree: "Agree",
  "Strongly agree": "Strongly agree",
});

const npsMap = Object.fromEntries(
  Array.from({ length: 11 }, (_, value) => [String(value), value]),
);
npsMap["10 Extremely Likely"] = 10;

const DEFAULT_RULES = Object.freeze([
  { ruleId: "VALUE_IDENTITY", name: "Retain destination-compatible value", version: "v1", transformType: "identity", status: "approved", notes: "No scale conversion. Use only when the source value is already valid for the destination." },
  { ruleId: "ELF_LIKERT_7_CANONICAL", name: "Canonical ELF seven-point labels", version: "v1", transformType: "categoricalMap", valueMap: LIKERT_7, status: "approved", notes: "Normalises label capitalisation only. Reverse-coded items are flagged but not scored because the supplied ELF does not define a scoring algorithm." },
  { ruleId: "PERCENT_0_100_CANONICAL", name: "Percentage label to 0-100 value", version: "v1", transformType: "categoricalMap", valueMap: { "0 percent": 0, "0%": 0, "20 percent": 20, "20%": 20, "40 percent": 40, "40%": 40, "60 percent": 60, "60%": 60, "80 percent": 80, "80%": 80, "100 percent": 100, "100%": 100 }, status: "approved", notes: "Canonicalises explicit percentage response choices without inferring missing values." },
  { ruleId: "NPS_0_10_CANONICAL", name: "Canonical 0-10 recommendation rating", version: "v1", transformType: "categoricalMap", valueMap: npsMap, status: "approved", notes: "Retains the genuine 0-10 NPS item scale; it does not convert binary recommendation questions into NPS." },
  { ruleId: "SATISFACTION_5_CANONICAL", name: "Canonical five-point satisfaction labels", version: "v1", transformType: "categoricalMap", valueMap: { "Extremely dissatisfied": "Extremely dissatisfied", "Somewhat dissatisfied": "Somewhat dissatisfied", "Somewhat dissatified": "Somewhat dissatisfied", "Neither satisfied or dissatisfied": "Neither satisfied nor dissatisfied", "Neither satisfied nor dissatisfied": "Neither satisfied nor dissatisfied", Neutral: "Neither satisfied nor dissatisfied", "Somewhat satisfied": "Somewhat satisfied", "Extremely satisfied": "Extremely satisfied" }, status: "approved", notes: "Normalises spelling and neutral-label variations without producing an unapproved numeric score." },
  { ruleId: "BINARY_CANONICAL", name: "Canonical Yes / No labels", version: "v1", transformType: "categoricalMap", valueMap: { Yes: "Yes", No: "No" }, status: "approved", notes: "Preserves a binary recommendation or consent measure as binary." },
  { ruleId: "SCALE_1_5_TO_100", name: "1-5 Likert to 0-100", version: "v1", transformType: "linear", sourceScale: { min: 1, max: 5 }, targetScale: { min: 0, max: 100 }, decimals: 0, status: "approved", notes: "Legacy configurable five-point conversion. Do not apply to ELF unless explicitly approved for a destination." },
  { ruleId: "SCALE_1_7_TO_100", name: "1-7 Likert to 0-100", version: "v1", transformType: "linear", sourceScale: { min: 1, max: 7 }, targetScale: { min: 0, max: 100 }, decimals: 1, status: "approved", notes: "Legacy configurable seven-point conversion." },
  { ruleId: "SCALE_1_10_TO_100", name: "1-10 rating to 0-100", version: "v1", transformType: "linear", sourceScale: { min: 1, max: 10 }, targetScale: { min: 0, max: 100 }, decimals: 1, status: "approved", notes: "Legacy configurable ten-point conversion." },
  { ruleId: "YES_NO_TO_100", name: "Yes / No to 100 / 0", version: "v1", transformType: "categoricalMap", valueMap: { Yes: 100, No: 0 }, status: "approved", notes: "Legacy binary conversion; use only for a destination that explicitly requires numeric values." },
  { ruleId: "TEXT_IDENTITY", name: "Retain free text", version: "v1", transformType: "identity", status: "approved", notes: "Retains non-identifying free-text responses in restricted outputs only." },
]);

const TARGET_QUESTIONS = Object.freeze([...ELF_QUESTIONS, ...PROGRAM_QUESTIONS]);

const ELF_TEMPLATE = Object.freeze({
  code: ELF_CODE,
  name: "Tasmanian Leaders Evaluation and Learning Framework",
  frameworkVersion: "Draft 0.1 · 18 January 2024",
  domains: ELF_DOMAINS,
  questions: ELF_QUESTIONS,
  scoringStatus: "not_supplied",
});

function createInitialState() {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    runs: [],
    rules: DEFAULT_RULES.map((rule) => ({ ...structuredClone(rule), createdAt: now, updatedAt: now, builtIn: true })),
    targetQuestions: TARGET_QUESTIONS.map((question) => structuredClone(question)),
  };
}

module.exports = { DEFAULT_RULES, ELF_TEMPLATE, TARGET_QUESTIONS, createInitialState };
