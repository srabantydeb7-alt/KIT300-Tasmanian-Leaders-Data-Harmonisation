const overviewStatistics = [
  {
    id: "datasets",
    value: 226,
    label: "unique datasets available",
    colour: "#2c69e8",
  },
  {
    id: "question-variants",
    value: 661,
    label: "normalised question variants",
    colour: "#7d3ee6",
  },
  {
    id: "validation-warnings",
    value: 18,
    label: "active validation warnings",
    colour: "#f5a000",
  },
  {
    id: "ready-for-export",
    value: 3,
    label: "ready for export",
    colour: "#16a756",
  },
];

exports.getOverviewStatistics = (req, res) => {
  try {
    res.status(200).json({
      statistics: overviewStatistics,
    });
  } catch (error) {
    console.error("Overview statistics error:", error);

    res.status(500).json({
      message: "Unable to load Overview statistics.",
    });
  }
};