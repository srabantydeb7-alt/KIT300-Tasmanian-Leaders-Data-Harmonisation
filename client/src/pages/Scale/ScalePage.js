import React, { useState } from "react";
import "./ScalePage.css";

function ScalePage() {
  const [sourceMin, setSourceMin] = useState(1);
  const [sourceMax, setSourceMax] = useState(5);

  const [targetMin, setTargetMin] = useState(0);
  const [targetMax, setTargetMax] = useState(100);

  const [exampleValue, setExampleValue] = useState(3);
  const [scaleConfirmed, setScaleConfirmed] = useState(false);

  const convertValue = (value) => {
    const sMin = Number(sourceMin);
    const sMax = Number(sourceMax);
    const tMin = Number(targetMin);
    const tMax = Number(targetMax);
    const inputValue = Number(value);

    if (sMax === sMin) {
      return null;
    }

    const converted =
      ((inputValue - sMin) / (sMax - sMin)) * (tMax - tMin) + tMin;

    return Number(converted.toFixed(2));
  };

  const convertedValue = convertValue(exampleValue);

  const isValueOutsideScale =
    Number(exampleValue) < Number(sourceMin) ||
    Number(exampleValue) > Number(sourceMax);

  const handleConfirmScale = () => {
    setScaleConfirmed(true);
  };

  return (
    <div className="scale-page">
      <div className="scale-header">
        <h1>Scale conversion</h1>
        <p>
          Review the detected response scale and convert values into a common
          target scale before validation.
        </p>
      </div>

      <div className="scale-top-grid">
        <section className="scale-card">
          <div className="card-heading-row">
            <h2>Source scale</h2>
            <span className="detected-badge">Detected</span>
          </div>

          <p className="card-description">
            The system has detected this scale from the uploaded dataset.
            Change the values below if the detected scale is incorrect.
          </p>

          <div className="scale-input-grid">
            <div className="scale-form-group">
              <label htmlFor="sourceMin">Minimum value</label>
              <input
                id="sourceMin"
                type="number"
                value={sourceMin}
                onChange={(event) => {
                  setSourceMin(event.target.value);
                  setScaleConfirmed(false);
                }}
              />
            </div>

            <div className="scale-form-group">
              <label htmlFor="sourceMax">Maximum value</label>
              <input
                id="sourceMax"
                type="number"
                value={sourceMax}
                onChange={(event) => {
                  setSourceMax(event.target.value);
                  setScaleConfirmed(false);
                }}
              />
            </div>
          </div>

          <div className="scale-summary">
            Detected source scale:
            <strong>
              {" "}
              {sourceMin} – {sourceMax}
            </strong>
          </div>

          <button
            className="confirm-button"
            type="button"
            onClick={handleConfirmScale}
          >
            Confirm source scale
          </button>

          {scaleConfirmed && (
            <p className="success-message">✓ Source scale confirmed</p>
          )}
        </section>

        <section className="scale-card">
          <h2>Target scale</h2>

          <p className="card-description">
            Choose the common scale that the source responses should be
            converted into.
          </p>

          <div className="scale-input-grid">
            <div className="scale-form-group">
              <label htmlFor="targetMin">Minimum value</label>
              <input
                id="targetMin"
                type="number"
                value={targetMin}
                onChange={(event) => setTargetMin(event.target.value)}
              />
            </div>

            <div className="scale-form-group">
              <label htmlFor="targetMax">Maximum value</label>
              <input
                id="targetMax"
                type="number"
                value={targetMax}
                onChange={(event) => setTargetMax(event.target.value)}
              />
            </div>
          </div>

          <div className="scale-summary">
            Selected target scale:
            <strong>
              {" "}
              {targetMin} – {targetMax}
            </strong>
          </div>
        </section>
      </div>

      <section className="scale-card preview-card">
        <h2>Conversion preview</h2>

        <p className="card-description">
          Enter a source value to preview how it will be converted.
        </p>

        <div className="preview-grid">
          <div className="scale-form-group">
            <label htmlFor="exampleValue">Source value</label>
            <input
              id="exampleValue"
              type="number"
              value={exampleValue}
              onChange={(event) => setExampleValue(event.target.value)}
            />
          </div>

          <div className="conversion-arrow">→</div>

          <div className="conversion-result">
            <span>Converted value</span>

            <strong>
              {convertedValue === null ? "Invalid scale" : convertedValue}
            </strong>
          </div>
        </div>

        {isValueOutsideScale && (
          <div className="warning-message">
            ⚠ The entered value is outside the selected source scale.
          </div>
        )}

        {Number(sourceMax) === Number(sourceMin) && (
          <div className="error-message">
            Source minimum and maximum cannot be the same.
          </div>
        )}

        <div className="formula-box">
          <span>Conversion</span>
          <strong>
            {exampleValue} on {sourceMin}–{sourceMax} →{" "}
            {convertedValue === null ? "Invalid" : convertedValue} on{" "}
            {targetMin}–{targetMax}
          </strong>
        </div>
      </section>

      <section className="scale-card next-step-card">
        <div>
          <h2>Ready for validation</h2>
          <p>
            Once the scale settings are confirmed, the converted dataset can be
            passed to the validation stage.
          </p>
        </div>

        <button
          className="validation-button"
          type="button"
          disabled={!scaleConfirmed}
        >
          Continue to validation
        </button>
      </section>
    </div>
  );
}

export default ScalePage;