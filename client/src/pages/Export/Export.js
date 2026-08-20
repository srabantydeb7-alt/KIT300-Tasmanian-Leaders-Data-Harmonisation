import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./PageStyles.css";

const exportOptions = [
  {
    id: "harmonised-dataset",
    label: "Harmonised dataset CSV",
    description:
      "One row per response with question code and converted value",
    defaultSelected: true,
  },
  {
    id: "validation-report",
    label: "Validation report CSV",
    description: "Errors, warnings, locations and recommended fixes",
    defaultSelected: true,
  },
  {
    id: "unmapped-report",
    label: "Unmapped question report",
    description: "Headers requiring manual review",
    defaultSelected: true,
  },
  {
    id: "mapping-workbook",
    label: "Mapping workbook update",
    description: "Reusable question-variant decisions",
    defaultSelected: true,
  },
  {
    id: "run-summary",
    label: "Run summary PDF",
    description: "Dataset counts, transformations and quality notes",
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
    personId: "null",
    question: "COHORT_AVG",
    value: 82,
    source: "r5/c4",
  },
];

function Export() {
  const navigate = useNavigate();

  const [selectedOutputs, setSelectedOutputs] = useState(
    exportOptions
      .filter((option) => option.defaultSelected)
      .map((option) => option.id)
  );

  const [saveMessage, setSaveMessage] = useState("");

  const remainingErrors = 4;
  const readyForExport = remainingErrors === 0;

  function toggleOutput(outputId) {
    setSaveMessage("");

    setSelectedOutputs((currentOutputs) => {
      if (currentOutputs.includes(outputId)) {
        return currentOutputs.filter((id) => id !== outputId);
      }

      return [...currentOutputs, outputId];
    });
  }

  function handleSaveSession() {
    const session = {
      selectedOutputs,
      savedAt: new Date().toISOString(),
    };

    localStorage.setItem("exportSession", JSON.stringify(session));
    setSaveMessage("Session saved successfully.");
  }

  function handleDownload() {
    if (!readyForExport) {
      return;
    }

    /*
     * Connect this function to the Express download endpoint later.
     * The selected output IDs are available in selectedOutputs.
     */
    console.log("Downloading:", selectedOutputs);
  }

  const finalChecks = [
    {
      id: "critical-errors",
      label: "Critical errors resolved",
      passed: readyForExport,
    },
    {
      id: "manual-mappings",
      label: "Manual mappings approved",
      passed: true,
    },
    {
      id: "identifiers-hashed",
      label: "Identifiers hashed",
      passed: true,
    },
    {
      id: "outputs-selected",
      label: "Output options selected",
      passed: selectedOutputs.length > 0,
    },
  ];

  const canDownload =
    readyForExport && selectedOutputs.length > 0;

  return (
    <div className="export-page">
      <header className="export-header">
        <div>
          <h1>Save, resume and export outputs</h1>

          <p>
            Choose the files needed for analysis, reporting or future mapping
            review.
          </p>
        </div>

        <span className="export-status">
          {readyForExport
            ? "Ready for export"
            : `Ready after ${remainingErrors} errors fixed`}
        </span>
      </header>

      {saveMessage && (
        <div className="export-success-message" role="status">
          {saveMessage}
        </div>
      )}

      <div className="export-layout">
        <section className="export-card selectable-outputs-card">
          <h2>Selectable outputs</h2>

          <div className="export-options">
            {exportOptions.map((option) => (
              <label className="export-option" key={option.id}>
                <input
                  type="checkbox"
                  checked={selectedOutputs.includes(option.id)}
                  onChange={() => toggleOutput(option.id)}
                />

                <span className="export-option-text">
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </div>

          <div className="export-actions">
            <button
              className="export-button download-button"
              type="button"
              disabled={!canDownload}
              onClick={handleDownload}
            >
              Download selected
            </button>

            <button
              className="export-button save-button"
              type="button"
              onClick={handleSaveSession}
            >
              Save session
            </button>
          </div>
        </section>

        <div className="export-right-column">
          <section className="export-card">
            <h2>Output schema preview</h2>

            <div className="export-table-wrapper">
              <table className="export-schema-table">
                <thead>
                  <tr>
                    <th>dataset</th>
                    <th>person_id</th>
                    <th>question</th>
                    <th>value</th>
                    <th>source</th>
                  </tr>
                </thead>

                <tbody>
                  {schemaRows.map((row, index) => (
                    <tr key={`${row.dataset}-${index}`}>
                      <td>{row.dataset}</td>
                      <td>{row.personId}</td>
                      <td>{row.question}</td>
                      <td>{row.value}</td>
                      <td>{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="export-card final-checks-card">
            <div className="final-checks-header">
              <h2>Final checks before export</h2>

              {!readyForExport && (
                <button
                  className="validation-button"
                  type="button"
                  onClick={() => navigate("/validation")}
                >
                  Go to validation
                </button>
              )}
            </div>

            <ul className="final-checks-list">
              {finalChecks.map((check) => (
                <li key={check.id}>
                  <span
                    className={
                      check.passed
                        ? "check-status check-passed"
                        : "check-status check-failed"
                    }
                  >
                    {check.passed ? "✓" : "!"}
                  </span>

                  <strong>{check.label}</strong>
                  <span className="required-text">Required</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

export default Export;