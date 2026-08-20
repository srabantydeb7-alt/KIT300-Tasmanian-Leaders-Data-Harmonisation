const fs = require("node:fs");

const { ALLOWED_EXTENSIONS } = require("../Services/fileParser");
const { WorkflowError } = require("../Services/runService");

function createDatasetController(runService) {
  function uploadDataset(req, res, next) {
    const sourceFile = req.files?.dataset?.[0] || req.file;
    const destinationFile = req.files?.destination?.[0] || null;
    if (!sourceFile) return next(new WorkflowError(400, "No dataset file was uploaded."));

    let buffer;
    let destinationBuffer;
    try {
      buffer = fs.readFileSync(sourceFile.path);
      destinationBuffer = destinationFile ? fs.readFileSync(destinationFile.path) : null;
      const run = runService.createRun(
        buffer,
        sourceFile.originalname,
        req.body,
        destinationFile
          ? { buffer: destinationBuffer, originalName: destinationFile.originalname }
          : null,
      );
      return res.status(201).json({
        success: true,
        data: { ...run, file: run.source },
      });
    } catch (error) {
      return next(error);
    } finally {
      buffer = null;
      destinationBuffer = null;
      for (const temporaryFile of [sourceFile, destinationFile].filter(Boolean)) {
        try {
          const stats = fs.lstatSync(temporaryFile.path);
          if (stats.isFile() && !stats.isSymbolicLink()) fs.unlinkSync(temporaryFile.path);
        } catch (cleanupError) {
          if (cleanupError.code !== "ENOENT") {
            console.error("Unable to remove temporary upload:", cleanupError.message);
          }
        }
      }
    }
  }

  function createDemo(req, res, next) {
    try {
      return res.status(201).json({ success: true, data: runService.createDemoRun() });
    } catch (error) {
      return next(error);
    }
  }

  return { uploadDataset, createDemo };
}

module.exports = {
  ALLOWED_EXTENSIONS,
  createDatasetController,
};
