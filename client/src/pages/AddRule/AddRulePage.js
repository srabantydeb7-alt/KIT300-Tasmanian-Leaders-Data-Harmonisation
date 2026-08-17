import React, { useMemo, useState } from "react";
import "./AddRulePage.css";

const API_BASE = "http://localhost:5000/api/rules";

const STATUS_OPTIONS = ["Draft", "Active", "Review"];

const SOURCE_SCALE_OPTIONS = [
  "1–5 Likert",
  "1–7 Likert",
  "Yes / No",
  "Never–Always",
  "Free text",
  "Reverse item",
];

const TARGET_SCALE_OPTIONS = ["0–100", "Binary", "Text only"];

const emptyForm = {
  name: "SCALE_1_5_TO_100",
  version: "v1",
  status: "Draft",
  sourceQuestion: "",
  sourceScale: "1–5 Likert",
  standardQuestion: "",
  targetScale: "0–100",
  formula: "(x-1)/4*100",
  notes: "",
};

function buildPreview(sourceScale, targetScale) {
  if (sourceScale === "1–5 Likert" && targetScale === "0–100") {
    return [
      { source: 1, target: 0 },
      { source: 2, target: 25 },
      { source: 3, target: 50 },
      { source: 4, target: 75 },
      { source: 5, target: 100 },
    ];
  }

  if (sourceScale === "1–7 Likert" && targetScale === "0–100") {
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

  if (sourceScale === "Yes / No") {
    return [
      { source: "Yes", target: 100 },
      { source: "No", target: 0 },
    ];
  }

  return [];
}

function AddRulePage({ onBack, onSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const preview = useMemo(
    () => buildPreview(form.sourceScale, form.targetScale),
    [form.sourceScale, form.targetScale]
  );

  const handleChange = (field) => (event) => {
    setForm((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handleSave = async () => {
    setError("");

    if (
      !form.name.trim() ||
      !form.sourceQuestion.trim() ||
      !form.standardQuestion.trim() ||
      !form.formula.trim()
    ) {
      setError(
        "Rule name, source question, standard question and formula are required."
      );
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: form.name.trim(),
        type: "Scale Conversion",
        source: form.sourceScale,
        target: form.targetScale,
        rule: form.formula.trim(),
        status: form.status,
        version: form.version.trim(),
        sourceQuestion: form.sourceQuestion.trim(),
        standardQuestion: form.standardQuestion.trim(),
        notes: form.notes.trim(),
      };

      const response = await fetch(API_BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          body.message || `Failed to save rule (${response.status})`
        );
      }

      const savedRule = await response.json();

      if (typeof onSaved === "function") {
        onSaved(savedRule);
      }
    } catch (err) {
      setError(err.message || "Could not save the rule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ar-page">
      {/* Heading */}
      <div className="ar-top">
        <div>
          <h1>Add harmonisation rule</h1>
          <p>
            Create a reusable rule for converting survey responses while
            preserving the original response.
          </p>
        </div>

        <button className="ar-back-button" onClick={onBack}>
          ← Back
        </button>
      </div>

      {error && <div className="ar-error">{error}</div>}

      {/* Rule Details */}
      <section className="ar-card ar-details-card">
        <h2>Rule details</h2>

        <div className="ar-grid-three">
          <div className="ar-field">
            <label>Rule ID / Rule Name *</label>
            <input
              value={form.name}
              onChange={handleChange("name")}
            />
          </div>

          <div className="ar-field">
            <label>Rule Version *</label>
            <input
              value={form.version}
              onChange={handleChange("version")}
            />
          </div>

          <div className="ar-field">
            <label>Status *</label>
            <select
              value={form.status}
              onChange={handleChange("status")}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Source + Target */}
      <div className="ar-source-target">
        <section className="ar-card">
          <h2>Source</h2>

          <div className="ar-field">
            <label>Source Question *</label>
            <input
              value={form.sourceQuestion}
              onChange={handleChange("sourceQuestion")}
              placeholder="Select source question"
            />
          </div>

          <div className="ar-field ar-gap">
            <label>Source Response / Scale *</label>
            <select
              value={form.sourceScale}
              onChange={handleChange("sourceScale")}
            >
              {SOURCE_SCALE_OPTIONS.map((scale) => (
                <option key={scale}>{scale}</option>
              ))}
            </select>
          </div>
        </section>

        <section className="ar-card">
          <h2>Target</h2>

          <div className="ar-field">
            <label>Standard Question *</label>
            <input
              value={form.standardQuestion}
              onChange={handleChange("standardQuestion")}
              placeholder="Select standard question"
            />
          </div>

          <div className="ar-field ar-gap">
            <label>Target Response / Standard Scale *</label>
            <select
              value={form.targetScale}
              onChange={handleChange("targetScale")}
            >
              {TARGET_SCALE_OPTIONS.map((scale) => (
                <option key={scale}>{scale}</option>
              ))}
            </select>
          </div>
        </section>
      </div>

      {/* Rule + Preview */}
      <section className="ar-card ar-rule-preview-card">
        <div className="ar-rule-column">
          <h2>Harmonisation rule</h2>

          <div className="ar-field">
            <label>Conversion / Formula *</label>
            <input
              value={form.formula}
              onChange={handleChange("formula")}
            />
          </div>

          <p className="ar-example">
            Example: 1–5 Likert converted to 0–100
          </p>
        </div>

        <div className="ar-preview-column">
          <h2>Preview</h2>

          <div className="ar-preview">
            {preview.map((item) => (
              <div
                className="ar-preview-item"
                key={`${item.source}-${item.target}`}
              >
                <span>{item.source}</span>
                <span>→</span>
                <strong>{item.target}</strong>
              </div>
            ))}
          </div>

          <span className="ar-retained">
            Original response retained
          </span>
        </div>
      </section>

      {/* Notes */}
      <section className="ar-card ar-notes-card">
        <div className="ar-notes-title">
          <label>Notes</label>
          <span>* Required field</span>
        </div>

        <textarea
          value={form.notes}
          onChange={handleChange("notes")}
          placeholder="Optional notes about this rule"
          rows="2"
        />
      </section>

      {/* Bottom Buttons */}
      <div className="ar-actions">
        <button
          className="ar-cancel-button"
          onClick={onBack}
          disabled={saving}
        >
          Cancel
        </button>

        <button
          className="ar-save-button"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save rule"}
        </button>
      </div>
    </div>
  );
}

export default AddRulePage;