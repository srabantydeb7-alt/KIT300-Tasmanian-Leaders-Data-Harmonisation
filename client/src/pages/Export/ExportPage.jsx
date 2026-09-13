import React, { useEffect, useRef, useState } from "react";
import EmptyWorkspace from "../../components/EmptyWorkspace";
import { api } from "../../api";

const OUTPUTS = [
  ["destination", "Destination-shaped CSV", "One row per source response using the selected destination's exact column order"],
  ["harmonised", "Long-form audit CSV", "Traceable response rows with pseudonymised identifiers and ELF metadata"],
  ["validation", "Validation report CSV", "Errors, warnings, locations, and recommended fixes"],
  ["unmapped", "Unmapped question report", "Headers still requiring human review"],
  ["mappings", "Mapping decisions CSV", "Reusable question-variant decisions and confidence"],
  ["summary", "Run summary PDF", "Counts, transformations, checksum, and quality notes"],
];

function ExportPage({ run, busy, onDemo, onNavigate }) {
  const [selected, setSelected] = useState([
    "destination",
    "harmonised",
    "validation",
    "mappings",
    "summary",
  ]);
  const [downloadState, setDownloadState] = useState({ status: "idle", message: "" });
  const [packageLink, setPackageLink] = useState(null);
  const packageLinkRef = useRef(null);

  useEffect(() => () => {
    if (packageLinkRef.current?.href) URL.revokeObjectURL(packageLinkRef.current.href);
  }, []);

  if (!run) {
    return (
      <div className="page">
        <div className="page-heading">
          <span className="eyebrow">Step 5 - Controlled release</span>
          <h1>Save, resume and export outputs</h1>
          <p>Download analysis data and its complete audit evidence.</p>
        </div>
        <EmptyWorkspace
          title="No outputs available"
          message="Complete a survey run before selecting export files."
          onDemo={onDemo}
          onNavigate={onNavigate}
          busy={busy}
        />
      </div>
    );
  }

  const exportable = Boolean(
    run.validation?.exportable || run.stage === "exportable" || run.stage === "exported",
  );
  const preview = (run.records || []).slice(0, 3);
  const unresolved = (run.mappings || []).filter(
    (mapping) => !["approved", "excluded"].includes(mapping.status),
  ).length;
  const downloading = downloadState.status === "running";

  const toggle = (type) => {
    setSelected((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type],
    );
  };

  const download = async () => {
    setDownloadState({
      status: "running",
      message: `Preparing ${selected.length} selected export files...`,
    });
    try {
      const { blob, filename } = await api.downloadExportBundle(run.id, selected);
      if (packageLinkRef.current?.href) URL.revokeObjectURL(packageLinkRef.current.href);
      const href = URL.createObjectURL(blob);
      const nextLink = { href, filename };
      packageLinkRef.current = nextLink;
      setPackageLink(nextLink);

      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setDownloadState({
        status: "success",
        message: `${selected.length} files exported as ${filename}.`,
      });
    } catch (error) {
      setDownloadState({
        status: "error",
        message: error.message || "The export package could not be created.",
      });
    }
  };

  return (
    <div className="page export-page">
      <div className="page-heading split-heading">
        <div>
          <span className="eyebrow">Step 5 - Controlled release</span>
          <h1>Save, resume and export outputs</h1>
          <p>Choose the files needed for analysis, reporting, or future mapping review.</p>
        </div>
        <span className={`status-pill large ${exportable ? "success" : "warning"}`}>
          {exportable ? "Ready for export" : "Resolve blocking errors"}
        </span>
      </div>

      <div className="content-grid export-grid">
        <section className="card output-selector">
          <span className="eyebrow">Export manifest</span>
          <h2>Selectable outputs</h2>
          <div className="output-list">
            {OUTPUTS.map(([type, label, description]) => (
              <label key={type}>
                <input
                  type="checkbox"
                  checked={selected.includes(type)}
                  onChange={() => toggle(type)}
                />
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="button-row">
            <button
              className="button dark"
              disabled={!exportable || !selected.length || downloading || busy}
              onClick={download}
              type="button"
            >
              {downloading ? "Preparing package" : "Download selected ZIP"}
            </button>
            <button className="button secondary" type="button">Session saved automatically</button>
            {packageLink && (
              <a className="button secondary" href={packageLink.href} download={packageLink.filename}>
                Save package again
              </a>
            )}
          </div>
          {downloadState.message && (
            <p className={`export-status ${downloadState.status}`}>
              {downloadState.message}
            </p>
          )}
        </section>

        <div className="stacked-cards">
          <section className="card">
            <span className="eyebrow">Canonical long format</span>
            <h2>Output schema preview</h2>
            <div className="table-scroll compact-table">
              <table>
                <thead>
                  <tr>
                    <th>Person ID</th>
                    <th>Question</th>
                    <th>Normalised</th>
                    <th>0-100</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((record, index) => (
                    <tr key={index}>
                      <td className="monospace">{record.personId?.slice(0, 10) || "-"}...</td>
                      <td>{record.targetQuestionCode}</td>
                      <td>{String(record.normalizedResponse ?? record.harmonisedValue ?? "-")}</td>
                      <td>{record.standardizedScore ?? "-"}</td>
                      <td>r{record.sourceRow}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!preview.length && <div className="empty-row">Run harmonisation to preview the output.</div>}
            </div>
          </section>

          <section className="card">
            <span className="eyebrow">Required gates</span>
            <h2>Final checks before export</h2>
            <div className="final-checks">
              <p className={exportable ? "pass" : "fail"}>
                <span>{exportable ? "OK" : "!"}</span>
                <strong>Critical errors resolved</strong>
                <small>Required</small>
              </p>
              <p className={unresolved === 0 ? "pass" : "fail"}>
                <span>{unresolved === 0 ? "OK" : "!"}</span>
                <strong>Manual mappings approved</strong>
                <small>Required</small>
              </p>
              <p className="pass">
                <span>OK</span>
                <strong>Identifiers pseudonymised</strong>
                <small>Required</small>
              </p>
              <p className={selected.length ? "pass" : "fail"}>
                <span>{selected.length ? "OK" : "!"}</span>
                <strong>Output options selected</strong>
                <small>Required</small>
              </p>
            </div>
            {!exportable && (
              <button className="button primary" onClick={() => onNavigate("validation")} type="button">
                Go to validation
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default ExportPage;
