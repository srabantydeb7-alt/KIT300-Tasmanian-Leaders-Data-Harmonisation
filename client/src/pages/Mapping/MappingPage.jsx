import React, { useMemo, useState } from "react";
import EmptyWorkspace from "../../components/EmptyWorkspace";

const scoreLabel = (confidence) => `${Math.round(Number(confidence || 0) * 100)}%`;

function MappingPage({ run, questions = [], rules = [], busy, onDemo, onNavigate, onSaveMapping, onProcess }) {
  const [query, setQuery] = useState("");
  const [selectedSource, setSelectedSource] = useState(null);
  const [choice, setChoice] = useState("");
  const [ruleChoice, setRuleChoice] = useState(null);
  const mappings = useMemo(() => run?.mappings || [], [run?.mappings]);
  const destinationQuestions = useMemo(
    () => run?.destination?.questions || questions,
    [questions, run?.destination?.questions],
  );
  const selected = mappings.find((mapping) => mapping.sourceQuestion === selectedSource) || mappings[0];
  const filtered = useMemo(() => mappings.filter((mapping) => `${mapping.sourceQuestion} ${mapping.targetQuestion || ""}`.toLowerCase().includes(query.toLowerCase())), [mappings, query]);
  const candidates = useMemo(() => {
    const values = [
      ...destinationQuestions.map((question) => ({ code: question.code, label: question.label, defaultRuleId: question.defaultRuleId })),
      ...(selected?.candidates || []),
      ...mappings.filter((mapping) => mapping.targetQuestionCode).map((mapping) => ({ code: mapping.targetQuestionCode, label: mapping.targetQuestion })),
    ];
    return values.filter((item, index) => values.findIndex((candidate) => candidate.code === item.code) === index);
  }, [destinationQuestions, mappings, selected]);
  const approvedRules = useMemo(() => {
    const latestById = new Map();
    rules.filter((rule) => rule.status === "approved").forEach((rule) => {
      const current = latestById.get(rule.ruleId);
      const version = Number(String(rule.version || "v0").replace("v", ""));
      const currentVersion = Number(String(current?.version || "v0").replace("v", ""));
      if (!current || version >= currentVersion) latestById.set(rule.ruleId, rule);
    });
    return [...latestById.values()];
  }, [rules]);
  const resolved = mappings.filter((mapping) => ["approved", "excluded"].includes(mapping.status)).length;
  const resolution = mappings.length ? Math.round((resolved / mappings.length) * 100) : 0;

  if (!run) return <div className="page"><div className="page-heading"><span className="eyebrow">Step 2 · Human confirmation</span><h1>Question mapping review</h1><p>Approve meaning before any values are transformed.</p></div><EmptyWorkspace title="No questions to map" message="Upload a survey or load the sanitised demonstration to generate confidence-based mapping suggestions." onDemo={onDemo} onNavigate={onNavigate} busy={busy} /></div>;

  const saveChoice = async () => {
    if (!selected) return;
    if (choice === "excluded") return onSaveMapping({ sourceQuestion: selected.sourceQuestion, status: "excluded", targetQuestionCode: null, targetQuestion: null, ruleId: null });
    const candidate = candidates.find((item) => item.code === (choice || selected.targetQuestionCode));
    if (candidate) await onSaveMapping({ sourceQuestion: selected.sourceQuestion, targetQuestionCode: candidate.code, targetQuestion: candidate.label, status: "approved", ruleId: ruleChoice || candidate.defaultRuleId || selected.ruleId || null });
  };

  return <div className="page mapping-page">
    <div className="page-heading split-heading"><div><span className="eyebrow">Step 2 · Human confirmation</span><h1>Question mapping review</h1><p>The selected destination governs the target questions and scales. Similarity scores remain suggestions until you confirm them.</p></div><div className="badge-cluster"><span className="status-pill success">{resolution}% resolved</span><span className="status-pill warning">{mappings.length - resolved} need review</span></div></div>
    <div className="mapping-grid"><section className="card mapping-table-card"><div className="card-heading"><div><span className="eyebrow">Uploaded headers</span><h2>Suggested destination matches</h2></div><input className="search-input" aria-label="Search questions" placeholder="Search questions" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="table-scroll"><table><thead><tr><th>Source question</th><th>Suggested target</th><th>Score</th><th>Status</th><th>Action</th></tr></thead><tbody>{filtered.map((mapping) => <tr className={selected?.sourceQuestion === mapping.sourceQuestion ? "selected-row" : ""} key={mapping.sourceQuestion}><td>{mapping.sourceQuestion}</td><td>{mapping.targetQuestion || "No reliable suggestion"}</td><td><strong className={Number(mapping.confidence) >= 0.85 ? "score high" : "score medium"}>{scoreLabel(mapping.confidence)}</strong></td><td><span className={`status-text ${mapping.status === "approved" ? "success" : mapping.status === "unmapped" ? "danger" : "warning"}`}>{mapping.status}</span></td><td><button className="text-button" onClick={() => { setSelectedSource(mapping.sourceQuestion); setChoice(mapping.targetQuestionCode || ""); setRuleChoice(mapping.ruleId || ""); }} type="button">{mapping.status === "approved" ? "Review" : "Resolve"}</button></td></tr>)}</tbody></table></div><div className="button-row end table-actions"><button className="button secondary" disabled={busy || mappings.some((mapping) => !["approved", "excluded"].includes(mapping.status))} onClick={async () => { if (await onProcess()) onNavigate("validation"); }} type="button">Run harmonisation</button></div></section>
      <aside className="card manual-panel"><span className="eyebrow">Human decision</span><h2>Manual mapping panel</h2>{selected ? <><label className="field-block"><span>Selected source question</span><div className="readonly-field">{selected.sourceQuestion}</div></label><fieldset className="choice-list"><legend>Choose destination question</legend>{candidates.map((candidate) => <label className={(choice || selected.targetQuestionCode) === candidate.code ? "selected" : ""} key={candidate.code}><input type="radio" name="target" value={candidate.code} checked={(choice || selected.targetQuestionCode) === candidate.code} onChange={(event) => { setChoice(event.target.value); setRuleChoice(candidate.defaultRuleId || ""); }} /><span><strong>{candidate.label}</strong><small>{candidate.code}</small></span></label>)}<label className={(choice || selected.targetQuestionCode) === "excluded" ? "selected" : ""}><input type="radio" name="target" value="excluded" checked={(choice || selected.targetQuestionCode) === "excluded"} onChange={(event) => { setChoice(event.target.value); setRuleChoice(""); }} /><span><strong>Do not harmonise</strong><small>Keep out of the standardised output</small></span></label></fieldset><label className="field-block"><span>Transformation rule</span><select aria-label="Transformation rule" value={ruleChoice ?? selected.ruleId ?? ""} onChange={(event) => setRuleChoice(event.target.value)} disabled={(choice || selected.targetQuestionCode) === "excluded"}><option value="">Use the destination default</option>{approvedRules.map((rule) => <option key={rule.ruleId} value={rule.ruleId}>{rule.name || rule.ruleId} · {rule.version}</option>)}</select></label><p className="helper-text">Only approved rule versions can be pinned. Destination changes create a different schema fingerprint and require fresh review.</p><button className="button dark full" onClick={saveChoice} disabled={busy || (!choice && !selected.targetQuestionCode)} type="button">Save mapping decision</button></> : <p className="empty-row">Select a source question to review.</p>}</aside>
    </div>
  </div>;
}
export default MappingPage;
