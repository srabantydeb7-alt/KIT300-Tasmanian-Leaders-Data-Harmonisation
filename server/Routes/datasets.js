const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const multer = require("multer");

const { ALLOWED_EXTENSIONS, createDatasetController } = require("../Controllers/datasetController");

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function createDatasetRouter({ runService, uploadDir }) {
  const router = express.Router();
  const resolvedUploadDir = path.resolve(uploadDir);
  fs.mkdirSync(resolvedUploadDir, { recursive: true, mode: 0o700 });

  const storage = multer.diskStorage({
    destination: (req, file, callback) => callback(null, resolvedUploadDir),
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${crypto.randomUUID()}${extension}`);
    },
  });
  const upload = multer({
    storage,
    limits: { files: 2, fileSize: MAX_UPLOAD_BYTES, fields: 10, fieldSize: 4_096 },
    fileFilter: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      if (ALLOWED_EXTENSIONS.includes(extension)) return callback(null, true);
      return callback(new Error("Only CSV and Excel (.xls or .xlsx) files are supported."));
    },
  });
  const controller = createDatasetController(runService);

  router.post(
    "/upload",
    upload.fields([
      { name: "dataset", maxCount: 1 },
      { name: "destination", maxCount: 1 },
    ]),
    controller.uploadDataset,
  );
  router.post("/demo", controller.createDemo);

  router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE"
        ? "Dataset file is larger than the 10 MB limit."
        : "Dataset upload was rejected.";
      return res.status(400).json({ success: false, error: { message } });
    }
    if (error && !error.status) {
      return res.status(400).json({ success: false, error: { message: error.message } });
    }
    return next(error);
  });

  return router;
}

module.exports = {
  MAX_UPLOAD_BYTES,
  createDatasetRouter,
};
