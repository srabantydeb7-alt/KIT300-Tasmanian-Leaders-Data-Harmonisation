import React from "react";

function EmptyWorkspace({ title, message, onDemo, onNavigate, busy }) {
  return <section className="empty-workspace card"><span className="empty-icon" aria-hidden="true">↗</span><h2>{title}</h2><p>{message}</p><div className="button-row centered"><button className="button primary" onClick={onDemo} disabled={busy} type="button">Load demonstration run</button><button className="button secondary" onClick={() => onNavigate("datasets")} type="button">Upload a survey</button></div></section>;
}
export default EmptyWorkspace;
