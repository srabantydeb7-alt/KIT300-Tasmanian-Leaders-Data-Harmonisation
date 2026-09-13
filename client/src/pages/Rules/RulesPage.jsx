import React, { useMemo, useState } from "react";

const EMPTY_RULE = {
  ruleId: "",
  name: "",
  transformType: "linear",
  sourceMin: 1,
  sourceMax: 5,
  targetMin: 0,
  targetMax: 100,
  decimals: 0,
  status: "approved",
  notes: "",
  categoryMappings: "Yes=1\nNo=0",
};

const versionNumber = (version) => Number(String(version || "v0").replace("v", "")) || 0;

function latestRuleVersions(rules) {
  const byId = new Map();
  rules.forEach((rule) => {
    const current = byId.get(rule.ruleId);
    if (!current || versionNumber(rule.version) >= versionNumber(current.version)) {
      byId.set(rule.ruleId, rule);
    }
  });
  return [...byId.values()];
}

function mappingText(valueMap = {}) {
  return Object.entries(valueMap).map(([source, target]) => `${source}=${String(target)}`).join("\n");
}

function parsePrimitive(value) {
  const trimmed = value.trim();
  if (/^(?:true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === "true";
  if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

function parseCategoryMappings(text) {
  return Object.fromEntries(
    String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 1) return [line, ""];
        return [line.slice(0, separator).trim(), parsePrimitive(line.slice(separator + 1))];
      }),
  );
}

function draftFromRule(rule) {
  return {
    ...EMPTY_RULE,
    ruleId: rule.ruleId,
    name: rule.name || rule.ruleId,
    transformType: rule.transformType,
    sourceMin: rule.sourceScale?.min ?? 1,
    sourceMax: rule.sourceScale?.max ?? 5,
    targetMin: rule.targetScale?.min ?? 0,
    targetMax: rule.targetScale?.max ?? 100,
    decimals: rule.decimals ?? 0,
    status: rule.status === "retired" ? "draft" : rule.status,
    notes: rule.notes || "",
    categoryMappings: mappingText(rule.valueMap),
  };
}

function rulePayload(draft) {
  const payload = {
    ruleId: draft.ruleId.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
    name: draft.name.trim(),
    transformType: draft.transformType,
    decimals: Number(draft.decimals),
    status: draft.status,
    notes: draft.notes.trim(),
  };
  if (["linear", "reverse"].includes(draft.transformType)) {
    payload.sourceScale = { min: Number(draft.sourceMin), max: Number(draft.sourceMax) };
    payload.targetScale = { min: Number(draft.targetMin), max: Number(draft.targetMax) };
  }
  if (draft.transformType === "categoricalMap") {
    payload.valueMap = parseCategoryMappings(draft.categoryMappings);
  }
  return payload;
}

function previewRule(rule = EMPTY_RULE) {
  if (rule.transformType === "categoricalMap") {
    return Object.entries(rule.valueMap || parseCategoryMappings(rule.categoryMappings)).slice(0, 7);
  }
  if (rule.transformType === "identity") return [["Example", "Example"]];

  const sourceMin = Number(rule.sourceScale?.min ?? rule.sourceMin ?? 1);
  const sourceMax = Number(rule.sourceScale?.max ?? rule.sourceMax ?? 5);
  const targetMin = Number(rule.targetScale?.min ?? rule.targetMin ?? 0);
  const targetMax = Number(rule.targetScale?.max ?? rule.targetMax ?? 100);
  const decimals = Number(rule.decimals || 0);
  const count = Math.min(7, Math.max(2, Math.floor(sourceMax - sourceMin) + 1));
  return Array.from({ length: count }, (_, index) => {
    const source = sourceMin + index;
    const base = rule.transformType === "reverse" ? sourceMax + sourceMin - source : source;
    const raw = targetMin + ((base - sourceMin) * (targetMax - targetMin)) / (sourceMax - sourceMin || 1);
    return [source, Number(raw.toFixed(decimals))];
  });
}

function RulesPage({ rules = [], busy, onCreateRule, onCreateRuleVersion }) {
  const latestRules = useMemo(() => latestRuleVersions(rules), [rules]);
  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState(null);
  const [draft, setDraft] = useState(EMPTY_RULE);
  const selected = latestRules.find((rule) => rule.ruleId === selectedId) || latestRules[0];
  const preview = previewRule(editor ? draft : selected || EMPTY_RULE);
  const isVersion = editor?.kind === "version";

  const setField = (event) => {
    setDraft((current) => ({ ...current, [event.target.name]: event.target.value }));
  };
  const closeEditor = () => {
    setEditor(null);
    setDraft(EMPTY_RULE);
  };
  const startCreate = () => {
    setDraft(EMPTY_RULE);
    setEditor({ kind: "create" });
  };
  const startVersion = () => {
    if (!selected) return;
    setDraft(draftFromRule(selected));
    setEditor({ kind: "version", ruleId: selected.ruleId, version: versionNumber(selected.version) + 1 });
  };
  const submit = async (event) => {
    event.preventDefault();
    const payload = rulePayload(draft);
    const saved = isVersion
      ? await onCreateRuleVersion(editor.ruleId, payload)
      : await onCreateRule(payload);
    if (saved) closeEditor();
  };

  return (
    <div className="page rules-page">
      <div className="page-heading split-heading">
        <div>
          <span className="eyebrow">Step 3 · Deterministic conversion</span>
          <h1>Scale conversion rules</h1>
          <p>Review typed transformations while preserving every original response.</p>
        </div>
        <button className="button primary" onClick={editor ? closeEditor : startCreate} type="button">
          {editor ? "Back to library" : "Add rule"}
        </button>
      </div>

      {editor ? (
        <form className="rule-form" onSubmit={submit}>
          <section className="card">
            <div className="card-heading">
              <div><span className="eyebrow">Immutable version</span><h2>Rule details</h2></div>
              <span className="status-pill neutral">{isVersion ? `v${editor.version}` : "v1"}</span>
            </div>
            <div className="form-grid thirds">
              <label><span>Rule ID *</span><input name="ruleId" value={draft.ruleId} onChange={setField} readOnly={isVersion} required /></label>
              <label><span>Rule name *</span><input name="name" value={draft.name} onChange={setField} placeholder="1-5 Likert to 0-100" required /></label>
              <label><span>Status *</span><select name="status" value={draft.status} onChange={setField}><option value="draft">Draft</option><option value="approved">Approved</option><option value="retired">Retired</option></select></label>
            </div>
          </section>

          <section className="card">
            <div className="content-grid halves flush-grid">
              <div>
                <span className="eyebrow">Typed transformation</span>
                <h2>Harmonisation rule</h2>
                <div className="form-grid">
                  <label><span>Transformation *</span><select name="transformType" value={draft.transformType} onChange={setField}><option value="linear">Linear</option><option value="reverse">Reverse then linear</option><option value="identity">Identity</option><option value="categoricalMap">Categorical map</option></select></label>
                  <label><span>Decimal places *</span><input aria-label="Decimal places" name="decimals" type="number" min="0" max="10" value={draft.decimals} onChange={setField} /></label>
                </div>
                <label className="field-block"><span>Notes</span><textarea name="notes" value={draft.notes} onChange={setField} placeholder="Document semantic equivalence and approvals" /></label>
              </div>
              <div>
                <span className="eyebrow">Safe preview</span>
                <h2>Example outputs</h2>
                <div className="rule-preview">{preview.map(([source, target]) => <span key={String(source)}><strong>{String(source)}</strong><small>→</small><strong>{String(target)}</strong></span>)}</div>
                <p className="helper-text">The backend stores validated parameters, never executable formula text.</p>
              </div>
            </div>
          </section>

          {["linear", "reverse"].includes(draft.transformType) && (
            <div className="content-grid halves">
              <section className="card"><span className="eyebrow">Source</span><h2>Expected response scale</h2><div className="form-grid"><label><span>Minimum *</span><input name="sourceMin" type="number" value={draft.sourceMin} onChange={setField} required /></label><label><span>Maximum *</span><input name="sourceMax" type="number" value={draft.sourceMax} onChange={setField} required /></label></div></section>
              <section className="card"><span className="eyebrow">Target</span><h2>Approved standard scale</h2><div className="form-grid"><label><span>Minimum *</span><input name="targetMin" type="number" value={draft.targetMin} onChange={setField} required /></label><label><span>Maximum *</span><input name="targetMax" type="number" value={draft.targetMax} onChange={setField} required /></label></div></section>
            </div>
          )}

          {draft.transformType === "categoricalMap" && (
            <section className="card">
              <span className="eyebrow">Allowed categories</span>
              <h2>Category mappings</h2>
              <label className="field-block"><span>One source=target pair per line *</span><textarea aria-label="Category mappings" name="categoryMappings" value={draft.categoryMappings} onChange={setField} placeholder={"Strongly agree=100\nAgree=75\nNeutral=50"} required /></label>
            </section>
          )}

          <div className="button-row end">
            <button className="button secondary" onClick={closeEditor} type="button">Cancel</button>
            <button className="button primary" disabled={busy} type="submit">Save rule version</button>
          </div>
        </form>
      ) : (
        <div className="content-grid rule-library-grid">
          <section className="card">
            <div className="card-heading"><div><span className="eyebrow">Reusable knowledge</span><h2>Rule library</h2></div><span className="status-pill neutral">{latestRules.length} active</span></div>
            <div className="table-scroll"><table><thead><tr><th>Name</th><th>Source</th><th>Target</th><th>Type</th><th>Status</th></tr></thead><tbody>{latestRules.map((rule) => <tr className={selected?.ruleId === rule.ruleId ? "selected-row" : ""} key={`${rule.ruleId}-${rule.version}`} onClick={() => setSelectedId(rule.ruleId)}><td><strong>{rule.name || rule.ruleId}</strong><small className="table-subtitle">{rule.ruleId} · {rule.version}</small></td><td>{rule.sourceScale ? `${rule.sourceScale.min}-${rule.sourceScale.max}` : rule.transformType === "identity" ? "Original" : "Categorical"}</td><td>{rule.targetScale ? `${rule.targetScale.min}-${rule.targetScale.max}` : rule.transformType === "identity" ? "Original" : "Mapped"}</td><td>{rule.transformType}</td><td><span className={`status-text ${rule.status === "approved" ? "success" : "warning"}`}>{rule.status}</span></td></tr>)}</tbody></table>{!latestRules.length && <div className="empty-row">No rules saved yet. Add the first approved rule.</div>}</div>
          </section>
          <aside className="card rule-preview-card">
            <span className="eyebrow">Selected rule preview</span>
            <h2>{selected?.name || "Choose or add a rule"}</h2>
            {selected && <><dl className="detail-list"><div><dt>Rule ID</dt><dd>{selected.ruleId}</dd></div><div><dt>Version</dt><dd>{selected.version}</dd></div><div><dt>Transformation</dt><dd>{selected.transformType}</dd></div><div><dt>Rounding</dt><dd>{selected.decimals || 0} decimals</dd></div></dl><div className="rule-preview">{preview.map(([source, target]) => <span key={String(source)}><strong>{String(source)}</strong><small>→</small><strong>{String(target)}</strong></span>)}</div><div className="safety-list"><p><span>!</span><strong>Out-of-range response</strong><small>Flagged during validation</small></p><p><span>R</span><strong>Reverse scored item</strong><small>Requires an explicit typed rule</small></p><p><span>×</span><strong>Missing rule</strong><small>Blocks export</small></p></div><button className="button secondary full" onClick={startVersion} type="button">Create new version</button></>}
          </aside>
        </div>
      )}
    </div>
  );
}

export default RulesPage;
