const express = require("express");

function createRulesRouter(runService) {
  const router = express.Router();

  router.get("/", (req, res, next) => {
    try {
      return res.json({ success: true, data: runService.listRules() });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/", (req, res, next) => {
    try {
      return res.status(201).json({ success: true, data: runService.createRule(req.body) });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/:id/versions", (req, res, next) => {
    try {
      return res.status(201).json({
        success: true,
        data: runService.createRuleVersion(req.params.id, req.body),
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createRulesRouter };
