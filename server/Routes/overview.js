const express = require("express");
const {
  getOverviewStatistics,
} = require("../Controllers/overviewController");

const router = express.Router();

router.get("/stats", getOverviewStatistics);

module.exports = router;