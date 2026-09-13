import React, { useMemo, useRef, useState } from "react";

const INITIAL_METADATA = { program: "Tasmanian Leaders Program", year: String(new Date().getFullYear()), round: "Round 1" };

// The batch harmoniser reads these straight off the file path. Do the same here
// so staff confirm a filled-in answer instead of typing one from scratch.
const ACCEPTED = [".csv", ".xlsx", ".xls"];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// `accept` only filters the file picker, so a dropped file has to be checked here.
function rejectionReason(selected) {
  const name = String(selected?.name || "");
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (!ACCEPTED.includes(extension)) {
    return `${name} is not a CSV or Excel file. Save it as .csv or .xlsx and try again.`;
  }
  if (selected.size > MAX_UPLOAD_BYTES) {
    return `${name} is ${(selected.size / 1024 / 1024).toFixed(1)} MB, over the 10 MB limit.`;
  }
  if (selected.size === 0) return `${name} is empty.`;
  return null;
}

function metadataFromFileName(name) {
  const lower = String(name || "").toLowerCase();
  const inferred = {};
  if (/i-?lead/.test(lower)) inferred.program = "I-LEAD";
  else if (/\btlp\b|tasmanian leaders program/.test(lower)) inferred.program = "Tasmanian Leaders Program";
  else if (/\bdrip\b/.test(lower)) inferred.program = "DRIP";
  else if (/\bteal\b/.test(lower)) inferred.program = "TEAL";
  else if (/\blarc\b/.test(lower)) inferred.program = "LARC";
  else if (/next crop/.test(lower)) inferred.program = "Next Crop Tasmania";

  const year = String(name || "").match(/\b(20\d{2})\b/);
  if (year) inferred.year = year[1];

  if (/pre[- ]program|commencement/.test(lower)) inferred.round = "Pre-program";
  else if (/3[- ]month|delayed|longitudinal/.test(lower)) inferred.round = "3 month follow-up";
  else if (/completion|graduation|evaluation/.test(lower)) inferred.round = "Completion";
  else if (/pulse/.test(lower)) inferred.round = "Pulse";
  return inferred;
}

const CLASSIFICATION_LABELS = {
  PARTICIPANT_IDENTIFIER: "Participant identifier",
  ADMIN_METADATA: "Administration metadata",
  SENSITIVE_RESTRICTED: "Restricted information",
  FREE_TEXT: "Free-text response",
  ELF_PARTICIPANT_ITEM: "ELF participant item",
  ELF_MANAGER_ITEM: "ELF manager item",
  PROGRAM_MEASURE: "Program measure",
  UNCLASSIFIED_QUESTION: "Needs classification",
};

function DatasetsPage({ run, runs, busy, onUpload, onDemo, onSelectRun, onSaveClassification }) {
  const [file, setFile] = useState(null);
  const [destinationFile, setDestinationFile] = useState(null);
  const [metadata, setMetadata] = useState(INITIAL_METADATA);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const dragDepth = useRef(0);
  const [showPreview, setShowPreview] = useState(false);
  const inputRef = useRef(null);
  const destinationInputRef = useRef(null);
  const setField = (event) => setMetadata((current) => ({ ...current, [event.target.name]: event.target.value }));
  const chooseFile = (selected, droppedCount = 1) => {
    if (!selected) return;
    const reason = rejectionReason(selected);
    if (reason) {
      setFileError(reason);
      return;
    }
    setFileError(
      droppedCount > 1
        ? `${droppedCount} files were dropped. Using ${selected.name}. To process a whole folder at once, use File then Harmonise a whole folder.`
        : "",
    );
    setFile(selected);
    setMetadata((current) => ({ ...current, ...metadataFromFileName(selected.name) }));
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!file) return;
    const formData = new FormData();
    formData.append("dataset", file);
    if (destinationFile) formData.append("destination", destinationFile);
    Object.entries(metadata).forEach(([key, value]) => formData.append(key, value));
    if (await onUpload(formData)) {
      setFile(null);
      setDestinationFile(null);
    }
  };
  const profileStats = useMemo(() => [["Rows detected", run?.profile?.rowCount ?? "-"], ["Question columns", run?.profile?.questionColumns?.length ?? "-"], ["Identifier columns", run?.profile?.identifierColumns?.join(", ") || "Not detected"], ["Restricted columns", run?.profile?.sensitiveColumns?.length ?? 0], ["Destination", run?.destination?.name || "Tasmanian Leaders ELF 2024"]], [run]);
  const classifications = Object.entries(run?.profile?.fieldClassifications || {});
  const unresolvedClassifications = classifications.filter(([, field]) => field.classification === "UNCLASSIFIED_QUESTION");

  return <div className="page datasets-page">
    <div className="page-heading split-heading"><div><span className="eyebrow">Step 1 · Import and profile</span><h1>Source and destination setup</h1><p>Upload the source survey and optionally supply the destination dataset whose structure, questions and scales should govern this run.</p></div><button className="button secondary" onClick={onDemo} disabled={busy} type="button">Use sanitised demo</button></div>
    <form className="content-grid dataset-grid" onSubmit={submit}>
      <section className="card upload-card"><div className="card-heading"><div><span className="eyebrow">Source file</span><h2>Upload survey file</h2></div><span className="status-pill neutral">10 MB max</span></div>
        <div className={`dropzone ${dragging ? "dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDragging(true); }} onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setDragging(false); const dropped = event.dataTransfer.files; chooseFile(dropped?.[0], dropped?.length || 1); }}>
          <span className="upload-symbol" aria-hidden="true">↑</span><strong>{file ? file.name : "Drop CSV or XLSX here"}</strong><span>{file ? `${(file.size / 1024).toFixed(1)} KB selected` : "Your local source file will not be modified"}</span><button className="button primary compact" onClick={() => inputRef.current?.click()} type="button">Browse files</button><input ref={inputRef} aria-label="Choose survey file" accept=".csv,.xlsx,.xls" onChange={(event) => chooseFile(event.target.files?.[0])} type="file" hidden />
        </div>{fileError && <p className="file-notice" role="status">{fileError}</p>}<p className="helper-text">Only survey data required for harmonisation should be uploaded. The temporary upload is deleted after secure parsing; pseudonymised source values remain in the private workspace.</p>
        <div className="destination-picker"><div><span className="eyebrow">Destination schema</span><strong>{destinationFile ? destinationFile.name : "Tasmanian Leaders ELF 2024 destination template"}</strong><p>{destinationFile ? "This file will define the target columns, types and scales. Its response values are discarded after schema inference." : "The built-in template aligns questions to Insight, Influence and Impact, applies approved reverse-scoring metadata, and keeps the confirmed 1–7 scale separate from the observed range."}</p></div><div className="button-row"><button className="button secondary compact" onClick={() => destinationInputRef.current?.click()} type="button">{destinationFile ? "Change destination" : "Choose custom destination"}</button>{destinationFile && <button className="text-button" onClick={() => setDestinationFile(null)} type="button">Use built-in ELF</button>}<input ref={destinationInputRef} aria-label="Choose optional destination dataset" accept=".csv,.xlsx,.xls" onChange={(event) => setDestinationFile(event.target.files?.[0] || null)} type="file" hidden /></div></div>
      </section>
      <section className="card metadata-card"><span className="eyebrow">Run context</span><h2>Dataset metadata</h2><div className="form-grid">
        <label><span>Program *</span><input name="program" value={metadata.program} onChange={setField} required /></label><label><span>Year *</span><input name="year" type="number" min="1990" max="2100" value={metadata.year} onChange={setField} required /></label><label><span>Round *</span><input name="round" value={metadata.round} onChange={setField} required /></label>
      </div><div className="button-row end"><button className="button primary" disabled={!file || busy} type="submit">Upload and profile</button></div></section>
    </form>
    <div className="content-grid halves"><section className="card"><div className="card-heading"><div><span className="eyebrow">Live result</span><h2>Detected structure</h2></div>{run && <span className="status-pill success">Profiled</span>}</div><dl className="stat-list">{profileStats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><button className="button secondary" disabled={!run?.profile?.preview?.length} onClick={() => setShowPreview(true)} type="button">Preview first 20 rows</button></section>
      <section className="card"><div className="card-heading"><div><span className="eyebrow">Resume later</span><h2>Saved runs</h2></div><span className="status-pill neutral">{runs.length}</span></div><div className="table-scroll compact-table"><table><thead><tr><th>File</th><th>Program</th><th>Tier</th><th>Status</th><th /></tr></thead><tbody>{runs.length ? runs.map((savedRun) => <tr key={savedRun.id}><td>{savedRun.source?.originalName || "Survey"}</td><td>{savedRun.metadata?.program || "-"}</td><td>{String(savedRun.metadata?.qualityTier || "-").replace("tier", "")}</td><td><span className={`status-text ${savedRun.stage === "exportable" ? "success" : "warning"}`}>{String(savedRun.stage).replaceAll("_", " ")}</span></td><td><button className="text-button" onClick={() => onSelectRun(savedRun.id)} type="button">Resume</button></td></tr>) : <tr><td colSpan="5"><div className="empty-row">No saved runs yet.</div></td></tr>}</tbody></table></div></section>
    </div>
    {run && classifications.length > 0 && <section className="card"><div className="card-heading"><div><span className="eyebrow">Review before matching</span><h2>Detected information</h2><p>Identity, administration and restricted fields are never sent to fuzzy question matching.</p></div><span className={`status-pill ${unresolvedClassifications.length ? "warning" : "success"}`}>{unresolvedClassifications.length ? `${unresolvedClassifications.length} field${unresolvedClassifications.length === 1 ? "" : "s"} needs classification` : "All fields classified"}</span></div><div className="table-scroll"><table><thead><tr><th>Source field</th><th>Classification</th><th>Mapping</th><th>Review action</th></tr></thead><tbody>{classifications.map(([header, field]) => <tr key={header}><td>{header}</td><td><span className={`status-text ${field.classification === "UNCLASSIFIED_QUESTION" ? "warning" : "success"}`}>{CLASSIFICATION_LABELS[field.classification] || "Review required"}</span></td><td>{field.fuzzyEligible ? "Eligible after review" : "Not attempted"}</td><td>{field.classification === "UNCLASSIFIED_QUESTION" ? <div className="button-row"><button aria-label={`Treat ${header} as a program measure`} className="text-button" disabled={busy} onClick={() => onSaveClassification?.({ sourceColumn: header, classification: "PROGRAM_MEASURE" })} type="button">Program measure</button><button aria-label={`Treat ${header} as free text`} className="text-button" disabled={busy} onClick={() => onSaveClassification?.({ sourceColumn: header, classification: "FREE_TEXT" })} type="button">Free text</button></div> : "No action needed"}</td></tr>)}</tbody></table></div></section>}
    {showPreview && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowPreview(false)}><section className="modal-card wide" role="dialog" aria-modal="true" aria-labelledby="preview-title" onMouseDown={(event) => event.stopPropagation()}><div className="card-heading"><div><span className="eyebrow">Read-only source sample</span><h2 id="preview-title">First {run.profile.preview.length} rows</h2></div><button className="icon-button" aria-label="Close preview" onClick={() => setShowPreview(false)} type="button">×</button></div><div className="table-scroll"><table><thead><tr>{Object.keys(run.profile.preview[0] || {}).map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{run.profile.preview.map((row, index) => <tr key={index}>{Object.values(row).map((value, cell) => <td key={cell}>{String(value ?? "")}</td>)}</tr>)}</tbody></table></div></section></div>}
  </div>;
}
export default DatasetsPage;
