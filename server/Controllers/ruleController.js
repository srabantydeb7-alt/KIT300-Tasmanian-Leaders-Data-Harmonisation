let rules = [
  {
    id: 1,
    name: "1–5 Likert to 0–100",
    type: "Scale Conversion",
    source: "1–5 Likert",
    target: "0–100",
    rule: "(x - 1) / 4 * 100",
    status: "Active",
  },
  {
    id: 2,
    name: "1–7 Likert to 0–100",
    type: "Scale Conversion",
    source: "1–7 Likert",
    target: "0–100",
    rule: "(x - 1) / 6 * 100",
    status: "Active",
  },
  {
    id: 3,
    name: "Yes / No Conversion",
    type: "Response Conversion",
    source: "Yes / No",
    target: "Binary",
    rule: "Yes = 100, No = 0",
    status: "Review",
  },
];

let nextId = 4;

const getRules = (req, res) => {
  res.status(200).json(rules);
};

const getRuleById = (req, res) => {
  const id = Number(req.params.id);
  const foundRule = rules.find((rule) => rule.id === id);

  if (!foundRule) {
    return res.status(404).json({ message: "Rule not found" });
  }

  res.status(200).json(foundRule);
};

const createRule = (req, res) => {
  const { name, type, source, target, rule, status } = req.body;

  if (!name || !source || !target || !rule) {
    return res.status(400).json({
      message: "Name, source, target and rule details are required.",
    });
  }

  const newRule = {
    id: nextId++,
    name,
    type: type || "Scale Conversion",
    source,
    target,
    rule,
    status: status || "Draft",
  };

  rules.push(newRule);

  res.status(201).json(newRule);
};

const updateRule = (req, res) => {
  const id = Number(req.params.id);
  const index = rules.findIndex((rule) => rule.id === id);

  if (index === -1) {
    return res.status(404).json({ message: "Rule not found" });
  }

  rules[index] = {
    ...rules[index],
    ...req.body,
    id,
  };

  res.status(200).json(rules[index]);
};

const deleteRule = (req, res) => {
  const id = Number(req.params.id);
  const index = rules.findIndex((rule) => rule.id === id);

  if (index === -1) {
    return res.status(404).json({ message: "Rule not found" });
  }

  rules.splice(index, 1);

  res.status(200).json({
    message: "Rule deleted successfully",
  });
};

module.exports = {
  getRules,
  getRuleById,
  createRule,
  updateRule,
  deleteRule,
};