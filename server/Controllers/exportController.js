const exportOptions = [
  {
    id: "harmonised-dataset",
    label: "Harmonised dataset CSV",
    description:
      "One row per response with question code and converted value",
    fileType: "csv",
    defaultSelected: true,
  },
  {
    id: "validation-report",
    label: "Validation report CSV",
    description: "Errors, warnings, locations and recommended fixes",
    fileType: "csv",
    defaultSelected: true,
  },
  {
    id: "unmapped-report",
    label: "Unmapped question report",
    description: "Headers requiring manual review",
    fileType: "csv",
    defaultSelected: true,
  },
  {
    id: "mapping-workbook",
    label: "Mapping workbook update",
    description: "Reusable question-variant decisions",
    fileType: "xlsx",
    defaultSelected: true,
  },
  {
    id: "run-summary",
    label: "Run summary PDF",
    description: "Dataset counts, transformations and quality notes",
    fileType: "pdf",
    defaultSelected: false,
  },
];

const schemaRows = [
  {
    dataset: "TLP24",
    personId: "a9f...",
    question: "LEAD_CONF",
    value: 100,
    source: "r12/c8",
  },
  {
    dataset: "TLP24",
    personId: "b31...",
    question: "NETWORKS",
    value: 75,
    source: "r13/c9",
  },
  {
    dataset: "PULSE20",
    personId: null,
    question: "COHORT_AVG",
    value: 82,
    source: "r5/c4",
  },
];

const remainingErrors = 4;
const savedSessions = [];

function createChecks(outputsSelected = true) {
  return [
    {
      id: "critical-errors",
      label: "Critical errors resolved",
      required: true,
      passed: remainingErrors === 0,
    },
    {
      id: "manual-mappings",
      label: "Manual mappings approved",
      required: true,
      passed: true,
    },
    {
      id: "identifiers-hashed",
      label: "Identifiers hashed",
      required: true,
      passed: true,
    },
    {
      id: "outputs-selected",
      label: "Output options selected",
      required: true,
      passed: outputsSelected,
    },
  ];
}

function findInvalidOutputIds(outputIds) {
  const allowedIds = exportOptions.map((option) => option.id);

  return outputIds.filter(
    (outputId) => !allowedIds.includes(outputId)
  );
}

exports.getExportDetails = (req, res) => {
  try {
    const checks = createChecks(true);
    const ready = checks.every((check) => check.passed);

    res.status(200).json({
      remainingErrors,
      ready,
      outputs: exportOptions,
      schema: {
        columns: [
          "dataset",
          "person_id",
          "question",
          "value",
          "source",
        ],
        rows: schemaRows,
      },
      checks,
    });
  } catch (error) {
    console.error("Export details error:", error);

    res.status(500).json({
      message: "Unable to load Export information.",
    });
  }
};

exports.saveExportSession = (req, res) => {
  try {
    const { outputIds } = req.body;

    if (!Array.isArray(outputIds)) {
      return res.status(400).json({
        message: "outputIds must be an array.",
      });
    }

    const invalidIds = findInvalidOutputIds(outputIds);

    if (invalidIds.length > 0) {
      return res.status(400).json({
        message: `Invalid output options: ${invalidIds.join(", ")}`,
      });
    }

    const session = {
      id: savedSessions.length + 1,
      outputIds,
      savedAt: new Date().toISOString(),
    };

    savedSessions.push(session);

    return res.status(201).json({
      message: "Export session saved successfully.",
      session,
    });
  } catch (error) {
    console.error("Save session error:", error);

    return res.status(500).json({
      message: "Unable to save the Export session.",
    });
  }
};

exports.downloadSelected = (req, res) => {
  try {
    const { outputIds } = req.body;

    if (!Array.isArray(outputIds) || outputIds.length === 0) {
      return res.status(400).json({
        message: "Select at least one output.",
      });
    }

    const invalidIds = findInvalidOutputIds(outputIds);

    if (invalidIds.length > 0) {
      return res.status(400).json({
        message: `Invalid output options: ${invalidIds.join(", ")}`,
      });
    }

    const checks = createChecks(true);
    const ready = checks.every((check) => check.passed);

    if (!ready) {
      return res.status(409).json({
        message: `${remainingErrors} errors must be fixed before exporting.`,
      });
    }

    const downloadData = {
      generatedAt: new Date().toISOString(),
      selectedOutputs: outputIds,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="selected-exports.json"'
    );

    return res
      .status(200)
      .send(JSON.stringify(downloadData, null, 2));
  } catch (error) {
    console.error("Download error:", error);

    return res.status(500).json({
      message: "Unable to generate the selected outputs.",
    });
  }
};