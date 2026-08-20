const express = require("express");
const router = express.Router();

const {
  getRules,
  getRuleById,
  createRule,
  updateRule,
  deleteRule,
} = require("../Controllers/ruleController");

router.get("/", getRules);
router.get("/:id", getRuleById);
router.post("/", createRule);
router.put("/:id", updateRule);
router.delete("/:id", deleteRule);

module.exports = router;