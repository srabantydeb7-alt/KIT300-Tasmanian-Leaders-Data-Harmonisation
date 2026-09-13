import React from "react";

const NAV_ITEMS = [
  ["overview", "Overview"], ["datasets", "Datasets"], ["mapping", "Mapping"],
  ["rules", "Scale rules"], ["validation", "Validation"], ["export", "Export"],
];
const STAGE_INDEX = {
  uploaded: 0,
  profiled: 1,
  mapping: 2,
  needs_review: 2,
  ready: 3,
  ready_to_process: 3,
  transformed: 4,
  validation: 5,
  validated: 5,
  exportable: 6,
  exported: 7,
};

function workflowState(stage, threshold) {
  const current = STAGE_INDEX[stage] ?? -1;
  return current >= threshold ? "complete" : current === threshold - 1 ? "current" : "pending";
}

function WorkspaceLayout({ activePage, activeRun, runs, busy, notice, onDismissNotice, onNavigate, onSelectRun, children }) {
  const workflow = [["Import", 1], ["Map", 3], ["Convert", 5], ["Validate", 6], ["Export", 7]];
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => onNavigate("overview")} type="button">
          <span className="brand-mark" aria-hidden="true">TL</span>
          <span><strong>Tasmanian Leaders</strong><small>Data Harmonisation Platform</small></span>
        </button>
        <div className="topbar-actions">
          <span className="environment-pill">Internal workspace</span>
          <label className="run-selector"><span>Saved work</span>
            <select aria-label="Resume saved workspace" value={activeRun?.id || ""} onChange={(event) => onSelectRun(event.target.value)} disabled={busy}>
              <option value="">No active run</option>
              {runs.map((run) => <option key={run.id} value={run.id}>{run.metadata?.program || run.source?.originalName || "Survey"} · {run.metadata?.year || "Draft"}</option>)}
            </select>
          </label>
        </div>
      </header>
      <div className="workspace-grid">
        <aside className="sidebar" aria-label="Harmonisation workflow">
          <nav className="primary-nav">
            {NAV_ITEMS.map(([id, label], index) => (
              <button className={activePage === id ? "nav-item active" : "nav-item"} key={id} onClick={() => onNavigate(id)} type="button">
                <span>{index + 1}</span>{label}
              </button>
            ))}
          </nav>
          <div className="workflow-status"><p className="eyebrow">Workflow</p>
            {workflow.map(([label, threshold]) => <div className={`workflow-step ${workflowState(activeRun?.stage, threshold)}`} key={label}><span aria-hidden="true" />{label}</div>)}
          </div>
          <div className="privacy-note"><strong>Privacy aware</strong><span>Identifiers are pseudonymised before export.</span></div>
        </aside>
        <main className="main-content" aria-busy={busy}>
          {notice && <div className={`notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}><span>{notice.text}</span><button aria-label="Dismiss message" onClick={onDismissNotice} type="button">×</button></div>}
          {busy && <div className="progress-line" aria-label="Processing" />}
          {children}
        </main>
      </div>
    </div>
  );
}

export default WorkspaceLayout;
