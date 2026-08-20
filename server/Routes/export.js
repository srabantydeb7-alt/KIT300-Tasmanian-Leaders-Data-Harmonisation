const express = require("express");
const {
  downloadSelected,
  getExportDetails,
  saveExportSession,
} = require("../Controllers/exportController");

const router = express.Router();

router.get("/", getExportDetails);
router.post("/session", saveExportSession);
router.post("/download", downloadSelected);

module.exports = router;