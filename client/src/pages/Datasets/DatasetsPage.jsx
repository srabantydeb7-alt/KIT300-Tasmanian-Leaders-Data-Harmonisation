import React, { useMemo, useRef, useState } from "react";

const INITIAL_METADATA = { program: "Tasmanian Leaders Program", year: String(new Date().getFullYear()), round: "Round 1", qualityTier: "tier1", sourcePath: "", knownQuirks: "" };

function DatasetsPage({ run, runs, busy, onUpload, onDemo, onSelectRun }) {
  const [file, setFile] = useState(null);
  const [destinationFile, setDestinationFile] = useState(null);
  const [metadata, setMetadata] = useState(INITIAL_METADATA);
  const [dragging, setDragging] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const inputRef = useRef(null);
  const destinationInputRef = useRef(null);
  const setField = (event) => setMetadata((current) => ({ ...current, [event.target.name]: event.target.value }));
  const chooseFile = (selected) => {
    if (!selected) return;
    setFile(selected);
    setMetadata((current) => ({ ...current, sourcePath: current.sourcePath || selected.name }));
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

  return <div className="page datasets-page">
    <div className="page-heading split-heading"><div><span className="eyebrow">Step 1 · Import and profile</span><h1>Source and destination setup</h1><p>Upload the source survey and optionally supply the destination dataset whose structure, questions and scales should govern this run.</p></div><button className="button secondary" onClick={onDemo} disabled={busy} type="button">Use sanitised demo</button></div>
    <form className="content-grid dataset-grid" onSubmit={submit}>
      <section className="card upload-card"><div className="card-heading"><div><span className="eyebrow">Source file</span><h2>Upload survey file</h2></div><span className="status-pill neutral">10 MB max</span></div>
        <div className={`dropzone ${dragging ? "dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); }}>
          <span className="upload-symbol" aria-hidden="true">↑</span><strong>{file ? file.name : "Drop CSV or XLSX here"}</strong><span>{file ? `${(file.size / 1024).toFixed(1)} KB selected` : "Your local source file will not be modified"}</span><button className="button primary compact" onClick={() => inputRef.current?.click()} type="button">Browse files</button><input ref={inputRef} aria-label="Choose survey file" accept=".csv,.xlsx,.xls" onChange={(event) => chooseFile(event.target.files?.[0])} type="file" hidden />
        </div><p className="helper-text">Only survey data required for harmonisation should be uploaded. The temporary upload is deleted after secure parsing; pseudonymised source values remain in the private workspace.</p>
        <div className="destination-picker"><div><span className="eyebrow">Destination schema</span><strong>{destinationFile ? destinationFile.name : "Tasmanian Leaders ELF 2024 destination template"}</strong><p>{destinationFile ? "This file will define the target columns, types and scales. Its response values are discarded after schema inference." : "The built-in template aligns questions to Insight, Influence and Impact. It does not invent a numeric ELF score."}</p></div><div className="button-row"><button className="button secondary compact" onClick={() => destinationInputRef.current?.click()} type="button">{destinationFile ? "Change destination" : "Choose custom destination"}</button>{destinationFile && <button className="text-button" onClick={() => setDestinationFile(null)} type="button">Use built-in ELF</button>}<input ref={destinationInputRef} aria-label="Choose optional destination dataset" accept=".csv,.xlsx,.xls" onChange={(event) => setDestinationFile(event.target.files?.[0] || null)} type="file" hidden /></div></div>
      </section>
      <section className="card metadata-card"><span className="eyebrow">Run context</span><h2>Dataset metadata</h2><div className="form-grid">
        <label><span>Program *</span><input name="program" value={metadata.program} onChange={setField} required /></label><label><span>Year *</span><input name="year" type="number" min="1990" max="2100" value={metadata.year} onChange={setField} required /></label><label><span>Round *</span><input name="round" value={metadata.round} onChange={setField} required /></label><label><span>Quality tier *</span><select name="qualityTier" value={metadata.qualityTier} onChange={setField}><option value="tier1">Tier 1 · person linked</option><option value="tier2">Tier 2 · partial linkage</option><option value="tier3">Tier 3 · aggregate only</option></select></label><label><span>Source reference</span><input name="sourcePath" value={metadata.sourcePath} onChange={setField} placeholder="e.g. 2026/round-1" /></label><label><span>Known quirks</span><input name="knownQuirks" value={metadata.knownQuirks} onChange={setField} placeholder="Optional parsing notes" /></label>
      </div><div className="button-row end"><button className="button primary" disabled={!file || busy} type="submit">Upload and profile</button></div></section>
    </form>
    <div className="content-grid halves"><section className="card"><div className="card-heading"><div><span className="eyebrow">Live result</span><h2>Detected structure</h2></div>{run && <span className="status-pill success">Profiled</span>}</div><dl className="stat-list">{profileStats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><button className="button secondary" disabled={!run?.profile?.preview?.length} onClick={() => setShowPreview(true)} type="button">Preview first 20 rows</button></section>
      <section className="card"><div className="card-heading"><div><span className="eyebrow">Resume later</span><h2>Saved runs</h2></div><span className="status-pill neutral">{runs.length}</span></div><div className="table-scroll compact-table"><table><thead><tr><th>File</th><th>Program</th><th>Tier</th><th>Status</th><th /></tr></thead><tbody>{runs.length ? runs.map((savedRun) => <tr key={savedRun.id}><td>{savedRun.source?.originalName || "Survey"}</td><td>{savedRun.metadata?.program || "-"}</td><td>{String(savedRun.metadata?.qualityTier || "-").replace("tier", "")}</td><td><span className={`status-text ${savedRun.stage === "exportable" ? "success" : "warning"}`}>{String(savedRun.stage).replaceAll("_", " ")}</span></td><td><button className="text-button" onClick={() => onSelectRun(savedRun.id)} type="button">Resume</button></td></tr>) : <tr><td colSpan="5"><div className="empty-row">No saved runs yet.</div></td></tr>}</tbody></table></div></section>
    </div>
    {showPreview && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowPreview(false)}><section className="modal-card wide" role="dialog" aria-modal="true" aria-labelledby="preview-title" onMouseDown={(event) => event.stopPropagation()}><div className="card-heading"><div><span className="eyebrow">Read-only source sample</span><h2 id="preview-title">First {run.profile.preview.length} rows</h2></div><button className="icon-button" aria-label="Close preview" onClick={() => setShowPreview(false)} type="button">×</button></div><div className="table-scroll"><table><thead><tr>{Object.keys(run.profile.preview[0] || {}).map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{run.profile.preview.map((row, index) => <tr key={index}>{Object.values(row).map((value, cell) => <td key={cell}>{String(value ?? "")}</td>)}</tr>)}</tbody></table></div></section></div>}
  </div>;
}
export default DatasetsPage;
