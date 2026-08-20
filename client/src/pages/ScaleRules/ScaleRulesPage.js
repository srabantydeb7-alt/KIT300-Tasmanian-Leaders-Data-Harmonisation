import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./ScaleRulesPage.css";

const API_BASE = "http://localhost:5000/api/rules";

const SAFETY_CHECKS = [
  {
    icon: "!",
    label: "Out-of-range response",
    detail: "Reject answer or flag",
    tone: "warning",
  },
  {
    icon: "?",
    label: "Unsupported text scale",
    detail: "Manual review",
    tone: "warning",
  },
  {
    icon: "R",
    label: "Reverse scored item",
    detail: "Client approval required",
    tone: "info",
  },
  {
    icon: "×",
    label: "Missing conversion rule",
    detail: "Block export until resolved",
    tone: "error",
  },
];

function getReviewLabel(status) {
  switch (status) {
    case "Active":
      return "Auto";
    case "Review":
      return "Confirm";
    case "Draft":
      return "Review";
    default:
      return "Review";
  }
}

/*
  Safe preview generation.

  We deliberately do not execute a user-entered formula as JavaScript.
  Instead, known supported scale conversions are previewed explicitly.
*/
function buildPreview(rule) {
  if (!rule) return [];

  const source = rule.source?.trim();
  const target = rule.target?.trim();

  if (source === "1–5 Likert" && target === "0–100") {
    return [
      { source: 1, target: 0 },
      { source: 2, target: 25 },
      { source: 3, target: 50 },
      { source: 4, target: 75 },
      { source: 5, target: 100 },
    ];
  }

  if (source === "1–7 Likert" && target === "0–100") {
    return [
      { source: 1, target: 0 },
      { source: 2, target: 17 },
      { source: 3, target: 33 },
      { source: 4, target: 50 },
      { source: 5, target: 67 },
      { source: 6, target: 83 },
      { source: 7, target: 100 },
    ];
  }

  if (source === "Yes / No") {
    return [
      { source: "Yes", target: 100 },
      { source: "No", target: 0 },
    ];
  }

  return [];
}

function ScaleRulesPage({ onAddRule }) {
  const [rules, setRules] = useState([]);
  const [selectedRuleId, setSelectedRuleId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Load rules from Express backend
  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(API_BASE);

      if (!response.ok) {
        throw new Error(`Failed to load rules (${response.status})`);
      }

      const data = await response.json();

      setRules(data);

      if (data.length > 0) {
        setSelectedRuleId((currentId) => {
          const stillExists = data.some((rule) => rule.id === currentId);

          if (stillExists) {
            return currentId;
          }

          return data[0].id;
        });
      } else {
        setSelectedRuleId(null);
      }
    } catch (err) {
      setError(err.message || "Could not load harmonisation rules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const selectedRule = useMemo(() => {
    return (
      rules.find((rule) => rule.id === selectedRuleId) ||
      null
    );
  }, [rules, selectedRuleId]);

  const preview = useMemo(() => {
    return buildPreview(selectedRule);
  }, [selectedRule]);

  const handleAddRule = () => {
    if (typeof onAddRule === "function") {
      onAddRule();
      return;
    }

    console.warn(
      "ScaleRulesPage: onAddRule navigation has not been configured."
    );
  };

  return (
    <div className="sr-page">
      {/* Page heading */}
      <div className="sr-header">
        <div>
          <h1>Scale Conversion Rules</h1>

          <p className="sr-subtitle">
            Review how source answers are converted into approved harmonised
            values while preserving the original response.
          </p>
        </div>

        <button
          type="button"
          className="sr-btn-primary"
          onClick={handleAddRule}
        >
          + Add Rule
        </button>
      </div>

      {/* API error */}
      {error && (
        <div className="sr-error">
          <span>{error}</span>

          <button
            type="button"
            className="sr-retry-button"
            onClick={fetchRules}
          >
            Retry
          </button>
        </div>
      )}

      <div className="sr-columns">
        {/* Rule Library */}
        <section className="sr-card sr-library">
          <h2>Rule Library</h2>

          {loading ? (
            <div className="sr-loading">
              Loading harmonisation rules...
            </div>
          ) : (
            <div className="sr-table-wrapper">
              <table className="sr-table">
                <thead>
                  <tr>
                    <th>Source Scale</th>
                    <th>Target</th>
                    <th>Formula</th>
                    <th>Review</th>
                  </tr>
                </thead>

                <tbody>
                  {rules.map((rule) => {
                    const review = getReviewLabel(rule.status);

                    return (
                      <tr
                        key={rule.id}
                        className={
                          rule.id === selectedRuleId
                            ? "sr-row-selected"
                            : ""
                        }
                        onClick={() => setSelectedRuleId(rule.id)}
                      >
                        <td>{rule.source}</td>

                        <td>{rule.target}</td>

                        <td>
                          <code>{rule.rule}</code>
                        </td>

                        <td>
                          <span
                            className={`sr-review sr-review-${review.toLowerCase()}`}
                          >
                            {review}
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {rules.length === 0 && (
                    <tr>
                      <td
                        colSpan="4"
                        className="sr-empty"
                      >
                        No harmonisation rules are available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right side */}
        <div className="sr-side">
          {/* Selected Rule Preview */}
          <section className="sr-card">
            <h2>Selected Rule Preview</h2>

            {selectedRule ? (
              <>
                <p className="sr-preview-source">
                  Source:{" "}
                  <strong>{selectedRule.source}</strong>
                </p>

                {preview.length > 0 ? (
                  <>
                    <div className="sr-steps">
                      {preview.map((step, index) => (
                        <div
                          className="sr-step"
                          key={`${step.source}-${index}`}
                        >
                          <div
                            className={`sr-step-circle ${
                              index === preview.length - 1
                                ? "sr-step-last"
                                : ""
                            }`}
                          >
                            {step.source}
                          </div>

                          <span className="sr-step-label">
                            {step.target}
                          </span>
                        </div>
                      ))}
                    </div>

                    <p className="sr-converted">
                      Converted:{" "}
                      {preview
                        .map((step) => step.target)
                        .join(", ")}
                    </p>
                  </>
                ) : (
                  <div className="sr-preview-none">
                    <p>
                      <strong>Rule:</strong>{" "}
                      {selectedRule.rule}
                    </p>

                    <p>
                      A numeric preview is not available for
                      this rule. Manual review may be required.
                    </p>
                  </div>
                )}

                <span className="sr-retained-badge">
                  Original response retained
                </span>
              </>
            ) : (
              <p className="sr-preview-none">
                Select a rule from the Rule Library to preview
                its conversion.
              </p>
            )}
          </section>

          {/* Safety checks */}
          <section className="sr-card">
            <h2>Scale Safety Checks</h2>

            <ul className="sr-checks">
              {SAFETY_CHECKS.map((check) => (
                <li
                  key={check.label}
                  className="sr-check-item"
                >
                  <span
                    className={`sr-check-icon sr-check-${check.tone}`}
                  >
                    {check.icon}
                  </span>

                  <div className="sr-check-content">
                    <div className="sr-check-label">
                      {check.label}
                    </div>

                    <div className="sr-check-detail">
                      {check.detail}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

export default ScaleRulesPage;