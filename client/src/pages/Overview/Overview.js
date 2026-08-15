import React from "react";
import { useNavigate } from "react-router-dom";
import "./PageStyle.css";

function Overview() {
  const navigate = useNavigate();

  const statistics = [
    {
      id: 1,
      value: 226,
      label: "unique datasets available",
      colour: "#2c69e8",
    },
    {
      id: 2,
      value: 661,
      label: "normalised question variants",
      colour: "#7d3ee6",
    },
    {
      id: 3,
      value: 18,
      label: "active validation warnings",
      colour: "#f5a000",
    },
    {
      id: 4,
      value: 3,
      label: "ready for export",
      colour: "#16a756",
    },
  ];

  const workflowSteps = [
    { number: 1, label: "Upload", status: "complete" },
    { number: 2, label: "Extract", status: "complete" },
    { number: 3, label: "Map", status: "complete" },
    { number: 4, label: "Validate", status: "complete" },
    { number: 5, label: "Export", status: "current" },
  ];

  const staffActions = [
    "Configure file metadata by program, year, round and quality tier",
    "Approve suggested question matches using confidence scores",
    "Validate missing values, unsupported scales and unmapped headers",
    "Export a harmonised dataset, validation report or mapping report",
  ];

  const principles = [
    { label: "Traceable", style: "traceable" },
    { label: "Configurable", style: "configurable" },
    { label: "Privacy aware", style: "privacy" },
    { label: "Re-runnable", style: "rerunnable" },
  ];

  return (
    <div className="overview-page">
      <header className="overview-header">
        <div>
          <h1>Survey harmonisation workbench</h1>

          <p>
            A reusable front-end for uploading survey files, reviewing
            mappings, applying standardisation rules and exporting traceable
            harmonised data.
          </p>
        </div>

        <div className="overview-header-actions">
          <button
            className="overview-button upload-button"
            type="button"
            onClick={() => navigate("/datasets")}
          >
            Upload survey file
          </button>

          <button
            className="overview-button resume-button"
            type="button"
            onClick={() => navigate("/mapping")}
          >
            Resume saved work
          </button>
        </div>
      </header>

      <section
        className="overview-statistics-grid"
        aria-label="Harmonisation statistics"
      >
        {statistics.map((statistic) => (
          <article
            className="overview-stat-card"
            key={statistic.id}
            style={{ "--stat-colour": statistic.colour }}
          >
            <strong>{statistic.value}</strong>
            <span>{statistic.label}</span>
          </article>
        ))}
      </section>

      <section className="overview-middle-grid">
        <article className="overview-card workflow-card">
          <h2>Current workflow</h2>

          <div className="overview-workflow">
            {workflowSteps.map((step) => (
              <div className="overview-workflow-step" key={step.number}>
                <span className={`workflow-number ${step.status}`}>
                  {step.number}
                </span>

                <span className="workflow-label">{step.label}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="overview-card latest-run-card">
          <h2>Latest run summary</h2>

          <p>
            TLP 2024 Round 1 file uploaded. 93% of headers matched
            automatically. 7 questions require manual review before export.
          </p>

          <span className="review-badge">Human review required</span>
        </article>
      </section>

      <section className="overview-bottom-grid">
        <article className="overview-card staff-card">
          <h2>What staff can do here</h2>

          <ul className="staff-action-list">
            {staffActions.map((action) => (
              <li key={action}>
                <span className="action-check">✓</span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="overview-card principles-card">
          <h2>Processing principles</h2>

          <div className="principle-badges">
            {principles.map((principle) => (
              <span
                className={`principle-badge ${principle.style}`}
                key={principle.label}
              >
                {principle.label}
              </span>
            ))}
          </div>

          <p>
            The UI is designed around a deterministic loader: source rows are
            preserved, identifiers are hashed, unknown headers are reported and
            the run can be repeated after mapping updates.
          </p>
        </article>
      </section>
    </div>
  );
}

export default Overview;