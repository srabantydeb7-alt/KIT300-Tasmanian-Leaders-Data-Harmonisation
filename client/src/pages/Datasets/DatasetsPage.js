import React, { useState } from "react";
import "./DatasetsPage.css";

function DatasetsPage() {
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    setSelectedFile(file);
  };

  return (
    <div className="datasets-page">
      <div className="datasets-header">
        <h1>Dataset setup and file upload</h1>
        <p>
          Upload source files and record the metadata required for repeatable
          harmonisation.
        </p>
      </div>

      <div className="datasets-top-grid">
        <section className="dataset-card upload-card">
          <h2>Upload survey file</h2>

          <label className="upload-dropzone">
            <strong>Drop CSV or XLSX here</strong>
            <span>or browse from computer</span>

            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              hidden
            />
          </label>

          <label className="browse-button">
            Browse files
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              hidden
            />
          </label>

          {selectedFile && (
            <p className="selected-file">
              Selected file: <strong>{selectedFile.name}</strong>
            </p>
          )}
        </section>

        <section className="dataset-card metadata-card">
          <h2>Dataset metadata</h2>

          <div className="metadata-grid">
            <div className="form-group">
              <label htmlFor="program">Program</label>
              <input
                id="program"
                type="text"
                defaultValue="Tasmanian Leaders Program"
              />
            </div>

            <div className="form-group">
              <label htmlFor="year">Year</label>
              <input id="year" type="number" defaultValue="2024" />
            </div>

            <div className="form-group">
              <label htmlFor="round">Round</label>
              <input id="round" type="text" defaultValue="Round 1" />
            </div>

            <div className="form-group">
              <label htmlFor="qualityTier">Quality tier</label>
              <select id="qualityTier" defaultValue="tier1">
                <option value="tier1">Tier 1 - person linked</option>
                <option value="tier2">Tier 2</option>
                <option value="tier3">Tier 3 - aggregate only</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="sourcePath">Source path</label>
              <input
                id="sourcePath"
                type="text"
                defaultValue="/surveys/tlp/2024_round1.csv"
              />
            </div>

            <div className="form-group">
              <label htmlFor="knownQuirks">Known quirks</label>
              <input
                id="knownQuirks"
                type="text"
                defaultValue="Standard wide-format export"
              />
            </div>
          </div>

          <button className="queue-button" type="button">
            Add to queue
          </button>
        </section>
      </div>

      <div className="datasets-bottom-grid">
        <section className="dataset-card structure-card">
          <h2>Detected structure</h2>

          <div className="structure-list">
            <div>
              <span>Rows detected</span>
              <strong>154</strong>
            </div>

            <div>
              <span>Question columns</span>
              <strong>42</strong>
            </div>

            <div>
              <span>Identifier columns</span>
              <strong>Email, Name</strong>
            </div>

            <div>
              <span>Unsupported columns</span>
              <strong className="warning-text">2</strong>
            </div>
          </div>

          <button className="secondary-button" type="button">
            Preview first 20 rows
          </button>
        </section>

        <section className="dataset-card queue-card">
          <h2>Queued files</h2>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Program</th>
                  <th>Tier</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                <tr>
                  <td>2024_round1.csv</td>
                  <td>TLP</td>
                  <td>1</td>
                  <td>Ready</td>
                </tr>

                <tr>
                  <td>impact_2020.xlsx</td>
                  <td>Pulse</td>
                  <td>2</td>
                  <td className="warning-text">Needs quirk</td>
                </tr>

                <tr>
                  <td>legacy_2018.csv</td>
                  <td>I-LEAD</td>
                  <td>3</td>
                  <td>Aggregate only</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

export default DatasetsPage;