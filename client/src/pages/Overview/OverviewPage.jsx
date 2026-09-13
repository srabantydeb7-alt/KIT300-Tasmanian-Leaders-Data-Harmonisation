import React from "react";

function OverviewPage({ overview, run, onDemo, onNavigate, busy }) {
  // Each card answers "what should I do next", and every one names its unit.
  const metrics = [
    [overview.awaitingDecision, "questions awaiting your decision", overview.awaitingDecision ? "amber" : "purple"],
    [overview.blockingErrors, "blocking errors", overview.blockingErrors ? "red" : "green"],
    [overview.exportable, "runs ready to export", "green"],
    [overview.responses, "responses harmonised", "blue"],
  ];
  const mappings = run?.mappings || [];
  const reviewCount = mappings.filter((mapping) => ["review", "unmapped", "suggested"].includes(mapping.status)).length;
  const approvedPercent = mappings.length ? Math.round((mappings.filter((mapping) => ["approved", "excluded"].includes(mapping.status)).length / mappings.length) * 100) : 0;
  const workflowSteps = run?.workflowProgress?.steps || [];
  const nextAction = run?.nextAction || {
    page: reviewCount ? "mapping" : "validation",
    label: reviewCount ? "Review questions" : "Run validation",
    reason: reviewCount ? `${reviewCount} questions still need a decision` : "The run is ready for validation",
  };
  const elfCoverage = run?.elfCoverage;
  return <div className="page overview-page">
    <div className="page-heading split-heading"><div><span className="eyebrow">Auditable · repeatable · human controlled</span><h1>Survey harmonisation workbench</h1><p>Upload survey files, approve mappings, apply versioned rules, validate every transformation, and export traceable data.</p></div><div className="button-row"><button className="button primary" onClick={() => onNavigate("datasets")} type="button">Upload survey file</button><button className="button secondary" onClick={onDemo} disabled={busy} type="button">Load demonstration run</button></div></div>
    <div className="metric-grid">{metrics.map(([value, label, tone]) => <article className={`metric-card ${tone}`} key={label}><strong>{Number(value || 0).toLocaleString()}</strong><span>{label}</span></article>)}</div>
    <div className="content-grid two-thirds"><section className="card"><div className="card-heading"><div><span className="eyebrow">Current workflow</span><h2>{run ? `${run.metadata?.program || "Survey"} · ${run.metadata?.year || "Draft"}` : "No active run yet"}</h2></div>{run && <span className={`status-pill ${run.stage === "exportable" ? "success" : "warning"}`}>{String(run.stage || "uploaded").replaceAll("_", " ")}</span>}</div><ol className="stage-track">{workflowSteps.map((step, index) => <li className={step.status} key={step.page}><span>{index + 1}</span><small>{step.label}</small></li>)}</ol>{run ? <div className="run-summary"><strong>{approvedPercent}% of question mappings resolved</strong>{elfCoverage?.detectedItems > 0 && <p><strong>{elfCoverage.percent}% ELF coverage</strong> · {elfCoverage.mappedItems} of {elfCoverage.detectedItems} detected ELF items mapped</p>}<p>{nextAction.reason}</p><button className="button primary" onClick={() => onNavigate(nextAction.page)} type="button">{nextAction.label}</button></div> : <div className="run-summary muted-panel"><strong>Start with your own file or the sanitised demo.</strong><p>Original question and response values remain traceable; participant identifiers are pseudonymised.</p></div>}</section>
      <section className="card principles-card"><span className="eyebrow">Processing principles</span><h2>Automation with guardrails</h2><div className="tag-row"><span className="tag teal">Traceable</span><span className="tag purple">Configurable</span><span className="tag green">Privacy aware</span><span className="tag amber">Re-runnable</span></div><p>Exact aliases can be reused automatically. Similarity scores remain suggestions until a person confirms their meaning.</p><ul className="check-list"><li>Original questions and values retained in the audit trail</li><li>Typed rules only, no user-entered code execution</li><li>Blocking validation errors stop export</li></ul></section></div>
  </div>;
}
export default OverviewPage;
