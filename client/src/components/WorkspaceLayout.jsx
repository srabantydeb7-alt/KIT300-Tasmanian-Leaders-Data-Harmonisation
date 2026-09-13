import React from "react";

const NAV_ITEMS = [
  ["overview", "Overview"],
  ["datasets", "Datasets"],
  ["mapping", "Mapping"],
  ["standardisation", "Response Standardisation"],
  ["validation", "Validation"],
  ["export", "Export"],
];

const EMPTY_WORKFLOW = [
  ["datasets", "Datasets"],
  ["mapping", "Mapping"],
  ["standardisation", "Response Standardisation"],
  ["validation", "Validation"],
  ["export", "Export"],
].map(([page, label], index) => ({
  page,
  label,
  status: index === 0 ? "current" : "upcoming",
}));

function WorkspaceLayout({
  activePage,
  activeRun,
  runs,
  busy,
  notice,
  onDismissNotice,
  onNavigate,
  onSelectRun,
  children,
}) {
  const workflow =
    activeRun?.workflowProgress?.steps || EMPTY_WORKFLOW;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => onNavigate("overview")}
          type="button"
          aria-label="Go to Overview"
        >
          <span className="brand-logo-wrap">
            <img
              className="brand-logo-img"
              src="/tasmanian-leaders-logo.jpg"
              alt="Tasmanian Leaders"
            />
          </span>

          <span className="brand-copy">
            <strong>Tasmanian Leaders</strong>
            <small>Data Harmonisation Platform</small>
          </span>
        </button>

        <div className="topbar-actions">
          <span className="environment-pill">
            Internal workspace
          </span>

          <label className="run-selector">
            <span>Saved work</span>

            <select
              aria-label="Resume saved workspace"
              value={activeRun?.id || ""}
              onChange={(event) =>
                onSelectRun(event.target.value)
              }
              disabled={busy}
            >
              <option value="">No active run</option>

              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.metadata?.program ||
                    run.source?.originalName ||
                    "Survey"}{" "}
                  · {run.metadata?.year || "Draft"}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="workspace-grid">
        <aside
          className="sidebar"
          aria-label="Harmonisation workflow"
        >
          <nav
            className="primary-nav"
            aria-label="Main navigation"
          >
            {NAV_ITEMS.map(([id, label], index) => (
              <button
                className={
                  activePage === id
                    ? "nav-item active"
                    : "nav-item"
                }
                key={id}
                onClick={() => onNavigate(id)}
                type="button"
                aria-current={
                  activePage === id ? "page" : undefined
                }
              >
                <span className="nav-number" aria-hidden="true">
                  {index + 1}
                </span>

                <span className="nav-label">
                  {label}
                </span>
              </button>
            ))}
          </nav>

          <div className="workflow-status">
            <p className="eyebrow">Workflow</p>

            {workflow.map((step) => (
              <div
                className={`workflow-step ${
                  step.status === "upcoming"
                    ? "pending"
                    : step.status
                }`}
                key={step.page}
              >
                <span aria-hidden="true" />

                {step.label}
              </div>
            ))}
          </div>

          <div className="privacy-note">
            <strong>Privacy aware</strong>

            <span>
              Identifiers are pseudonymised before export.
            </span>
          </div>
        </aside>

        <main
          className="main-content"
          aria-busy={busy}
        >
          {notice && (
            <div
              className={`notice ${notice.kind}`}
              role={
                notice.kind === "error"
                  ? "alert"
                  : "status"
              }
              aria-live="polite"
            >
              <span>{notice.text}</span>

              <button
                aria-label="Dismiss message"
                onClick={onDismissNotice}
                type="button"
              >
                ×
              </button>
            </div>
          )}

          {busy && (
            <>
              <div
                className="progress-line"
                aria-label="Processing"
              />

              <div
                className="processing-banner"
                role="status"
                aria-live="polite"
              >
                <span
                  className="processing-spinner"
                  aria-hidden="true"
                />

                <div>
                  <strong>
                    Processing harmonisation data
                  </strong>

                  <small>
                    Please keep this page open while
                    the current step finishes.
                  </small>
                </div>
              </div>
            </>
          )}

          {children}
        </main>
      </div>

      <footer className="workspace-footer">
        <span>
          Tasmanian Leaders · Data Harmonisation Platform
        </span>

        <span>
          Internal workspace. Identifiers are
          pseudonymised before export.
        </span>
      </footer>
    </div>
  );
}

export default WorkspaceLayout;