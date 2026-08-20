const express = require("express");

const { EXPORTERS } = require("../Services/exportService");
const { WorkflowError } = require("../Services/runService");

function createRunsRouter(runService) {
  const router = express.Router();

  router.get("/", (req, res, next) => {
    try {
      return res.json({ success: true, data: runService.listRuns() });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:id", (req, res, next) => {
    try {
      return res.json({ success: true, data: runService.getRun(req.params.id) });
    } catch (error) {
      return next(error);
    }
  });

  router.patch("/:id/mappings", (req, res, next) => {
    try {
      return res.json({ success: true, data: runService.updateMapping(req.params.id, req.body) });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/:id/process", (req, res, next) => {
    try {
      return res.json({ success: true, data: runService.processRun(req.params.id) });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:id/exports/:type", (req, res, next) => {
    try {
      const exporter = EXPORTERS[req.params.type];
      if (!exporter) throw new WorkflowError(404, "Export type not found.");
      const run = runService.getInternalRun(req.params.id);
      if (["harmonised", "destination"].includes(req.params.type) && !run.validation?.exportable) {
        throw new WorkflowError(409, "Resolve blocking validation issues before harmonised export.");
      }
      const output = exporter.create(run);
      const filename = `${run.datasetCode}-${req.params.type}.${exporter.extension}`
        .replace(/[^A-Za-z0-9._-]/g, "-");
      res.set("Content-Type", exporter.contentType);
      res.set("Content-Disposition", `attachment; filename="${filename}"`);
      res.set("X-Content-Type-Options", "nosniff");
      return res.send(output);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createRunsRouter };
