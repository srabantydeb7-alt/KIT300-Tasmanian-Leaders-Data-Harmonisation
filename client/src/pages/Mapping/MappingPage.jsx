import React, { useMemo, useState } from "react";
import EmptyWorkspace from "../../components/EmptyWorkspace";

const scoreLabel = (confidence) => `${Math.round(Number(confidence || 0) * 100)}%`;

const confidenceBand = (mapping) => {
  if (mapping.confidenceBand) return mapping.confidenceBand;
  const confidence = Number(mapping.confidence || 0);
  if (confidence >= 0.85) return "high";
  return confidence >= 0.7 ? "medium" : "low";
};

const mappingLevelLabel = (mapping) => String(mapping.mappingLevel || mapping.method || "unmapped")
  .toLowerCase()
  .replaceAll("_", " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const sourceVariableType = (column) => {
  if (!column) return "unknown";
  if (column.kind !== "number") return "categorical or text";
  const scale = column.detectedScale;
  const spread = scale ? Number(scale.max) - Number(scale.min) : null;
  return Number(column.uniqueCount) <= 11 && spread !== null && spread <= 10
    ? "ordinal (discrete scale)"
    : "continuous";
};

const needsWork = (mapping) => !["approved", "excluded"].includes(mapping.status);

function MappingPage({
  run,
  questions = [],
  rules = [],
  busy,
  onDemo,
  onNavigate,
  onSaveMapping,
  onProcess,
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedSource, setSelectedSource] = useState(null);
  const [choice, setChoice] = useState("");
  const [ruleChoice, setRuleChoice] = useState("");

  const mappings = useMemo(() => run?.mappings || [], [run?.mappings]);
  const destinationQuestions = useMemo(
    () => run?.destination?.questions || questions,
    [questions, run?.destination?.questions],
  );
  const selected = selectedSource
    ? mappings.find((mapping) => mapping.sourceQuestion === selectedSource) || null
    : null;
  const sourceColumn = selected ? run?.profile?.columns?.[selected.sourceQuestion] : null;
  const counts = useMemo(() => ({
    all: mappings.length,
    review: mappings.filter(needsWork).length,
    approved: mappings.filter((mapping) => mapping.status === "approved").length,
    excluded: mappings.filter((mapping) => mapping.status === "excluded").length,
  }), [mappings]);

  const filtered = useMemo(() => {
    const term = query.toLowerCase();
    return mappings
      .filter((mapping) => `${mapping.sourceQuestion} ${mapping.targetQuestion || mapping.suggestedTarget || ""}`.toLowerCase().includes(term))
      .filter((mapping) => {
        if (statusFilter === "review") return needsWork(mapping);
        if (statusFilter === "approved") return mapping.status === "approved";
        if (statusFilter === "excluded") return mapping.status === "excluded";
        return true;
      })
      .slice()
      .sort((left, right) => {
        if (needsWork(left) !== needsWork(right)) return needsWork(left) ? -1 : 1;
        return Number(right.confidence || 0) - Number(left.confidence || 0);
      });
  }, [mappings, query, statusFilter]);

  const bulkExcludable = useMemo(
    () => mappings.filter((mapping) => needsWork(mapping) && !mapping.targetQuestionCode && !mapping.suggestedTargetCode),
    [mappings],
  );

  const defaultRuleForCandidate = (candidate) =>
    candidate?.defaultRuleId ||
    (candidate?.scoringStatus === "SCORING_METADATA_REVIEW_REQUIRED" ? "ELF_LIKERT_7_CANONICAL" : "");

  const candidateForCode = (code) =>
    destinationQuestions.find((question) => question.code === code) ||
    mappings.find((mapping) => mapping.targetQuestionCode === code || mapping.suggestedTargetCode === code);

  const targetCodeFor = (mapping) => mapping.targetQuestionCode || mapping.suggestedTargetCode || "";
  const targetLabelFor = (mapping) =>
    mapping.targetQuestion ||
    mapping.suggestedTarget ||
    (mapping.construct ? `Construct: ${mapping.construct}` : "No reliable suggestion");

  const candidates = useMemo(() => {
    if (!selected) return [];
    const values = [
      ...destinationQuestions.map((question) => ({
        code: question.code,
        label: question.label,
        defaultRuleId: question.defaultRuleId,
        instrumentId: question.instrumentId,
        sourceStatus: question.sourceStatus,
        scoringStatus: question.scoringStatus,
      })),
      ...(selected.candidates || []),
      ...mappings
        .filter((mapping) => mapping.targetQuestionCode || mapping.suggestedTargetCode)
        .map((mapping) => ({
          code: mapping.targetQuestionCode || mapping.suggestedTargetCode,
          label: mapping.targetQuestion || mapping.suggestedTarget,
          defaultRuleId: mapping.ruleId,
          scoringStatus: mapping.scoringStatus,
        })),
    ].filter((item) => item.code && item.label);
    return values.filter((item, index) =>
      values.findIndex((candidate) => candidate.code === item.code) === index,
    );
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
  const selectedCandidateCode = choice || targetCodeFor(selected || {});
  const selectedCandidate = candidates.find((item) => item.code === selectedCandidateCode);
  const scoringMetadataNeedsReview =
    selectedCandidate?.scoringStatus === "SCORING_METADATA_REVIEW_REQUIRED";

  if (!run) {
    return (
      <div className="page">
        <div className="page-heading">
          <span className="eyebrow">Step 2 - Human confirmation</span>
          <h1>Question mapping review</h1>
          <p>Approve meaning before any values are transformed.</p>
        </div>
        <EmptyWorkspace
          title="No questions to map"
          message="Upload a survey or load the sanitised demonstration to generate confidence-based mapping suggestions."
          onDemo={onDemo}
          onNavigate={onNavigate}
          busy={busy}
        />
      </div>
    );
  }

  const openDecision = (mapping) => {
    const targetCode = targetCodeFor(mapping);
    const candidate = candidateForCode(targetCode);
    setSelectedSource(mapping.sourceQuestion);
    setChoice(targetCode);
    setRuleChoice(mapping.ruleId || defaultRuleForCandidate(candidate) || "");
  };

  const closeDecision = () => {
    setSelectedSource(null);
    setChoice("");
    setRuleChoice("");
  };

  const saveChoice = async () => {
    if (!selected) return;
    if (choice === "excluded") {
      await onSaveMapping({
        sourceQuestion: selected.sourceQuestion,
        status: "excluded",
        targetQuestionCode: null,
        targetQuestion: null,
        ruleId: null,
      });
      closeDecision();
      return;
    }
    const candidate = candidates.find((item) => item.code === selectedCandidateCode);
    if (!candidate) return;
    await onSaveMapping({
      sourceQuestion: selected.sourceQuestion,
      targetQuestionCode: candidate.code,
      targetQuestion: candidate.label,
      status: "approved",
      ruleId: ruleChoice || defaultRuleForCandidate(candidate) || selected.ruleId || null,
    });
    closeDecision();
  };

  const approveSuggestion = async (mapping) => {
    const targetCode = targetCodeFor(mapping);
    const candidate = candidateForCode(targetCode);
    if (!targetCode || !candidate) return;
    await onSaveMapping({
      sourceQuestion: mapping.sourceQuestion,
      targetQuestionCode: targetCode,
      targetQuestion: candidate.label || targetLabelFor(mapping),
      status: "approved",
      ruleId: mapping.ruleId || defaultRuleForCandidate(candidate) || null,
    });
  };

  const excludeAllUnmatched = async () => {
    setBulkBusy(true);
    try {
      for (const mapping of bulkExcludable) {
        await onSaveMapping({
          sourceQuestion: mapping.sourceQuestion,
          status: "excluded",
          targetQuestionCode: null,
          targetQuestion: null,
          ruleId: null,
        });
      }
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="page mapping-page">
      <div className="page-heading split-heading">
        <div>
          <span className="eyebrow">Step 2 - Human confirmation</span>
          <h1>Question mapping review</h1>
          <p>The selected destination governs the target questions and scales. Similarity scores remain suggestions until you confirm them.</p>
        </div>
        <div className="badge-cluster">
          <span className="status-pill success">{resolution}% resolved</span>
          <span className="status-pill warning">{mappings.length - resolved} need review</span>
        </div>
      </div>

      <section className="card mapping-table-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Uploaded headers</span>
            <h2>Suggested destination matches</h2>
            <p className="helper-text">Review each source question against the suggested target, then approve or change the pairing.</p>
          </div>
          <input
            className="search-input"
            aria-label="Search questions"
            placeholder="Search questions"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="mapping-toolbar">
          <div className="filter-chips" role="group" aria-label="Filter by status">
            {[
              ["review", "Needs review"],
              ["all", "All"],
              ["approved", "Approved"],
              ["excluded", "Excluded"],
            ].map(([id, label]) => (
              <button
                aria-pressed={statusFilter === id}
                className={statusFilter === id ? "chip active" : "chip"}
                key={id}
                onClick={() => setStatusFilter(id)}
                type="button"
              >
                {label} <span>{counts[id]}</span>
              </button>
            ))}
          </div>
          {bulkExcludable.length > 0 && (
            <button
              className="button secondary bulk-approve"
              disabled={busy || bulkBusy}
              onClick={excludeAllUnmatched}
              title="Keeps every question that has no suggested match out of the output. You can still map any of them individually afterwards."
              type="button"
            >
              {bulkBusy ? "Excluding..." : `Exclude ${bulkExcludable.length} unmatched`}
            </button>
          )}
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Source question</th>
                <th>Suggested target</th>
                <th>Decision level</th>
                <th>Score</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((mapping) => {
                const hasTarget = Boolean(targetCodeFor(mapping));
                return (
                  <tr key={mapping.sourceQuestion}>
                    <td className="question-cell">{mapping.sourceQuestion}</td>
                    <td className="target-cell">{targetLabelFor(mapping)}</td>
                    <td>{mappingLevelLabel(mapping)}</td>
                    <td>
                      <strong
                        className={`score ${confidenceBand(mapping)}`}
                        title={`${confidenceBand(mapping)} confidence match`}
                      >
                        {scoreLabel(mapping.confidence)}
                      </strong>
                    </td>
                    <td>
                      <span className={`status-text ${mapping.status === "approved" ? "success" : mapping.status === "unmapped" ? "danger" : "warning"}`}>
                        {mapping.status}
                      </span>
                    </td>
                    <td>
                      <div className="mapping-action-cell">
                        <button
                          className="text-button"
                          aria-label={`Change mapping for ${mapping.sourceQuestion}`}
                          onClick={() => openDecision(mapping)}
                          type="button"
                        >
                          Change
                        </button>
                        {hasTarget && mapping.status !== "approved" && (
                          <button
                            className="button compact"
                            aria-label={`Approve mapping for ${mapping.sourceQuestion}`}
                            disabled={busy}
                            onClick={() => approveSuggestion(mapping)}
                            type="button"
                          >
                            Approve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="empty-row">Nothing matches this filter.</p>}
        </div>

        <div className="button-row end table-actions">
          <button
            className="button secondary"
            disabled={busy || mappings.some((mapping) => !["approved", "excluded"].includes(mapping.status))}
            onClick={async () => {
              const nextRun = await onProcess();
              if (nextRun) onNavigate(nextRun.nextAction?.page || "validation");
            }}
            type="button"
          >
            Run harmonisation
          </button>
        </div>
      </section>

      {selected && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDecision();
        }}>
          <section className="modal-card wide decision-modal" role="dialog" aria-modal="true" aria-label="Change mapping decision">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">Human decision</span>
                <h2>Change mapping</h2>
              </div>
              <button className="text-button" onClick={closeDecision} type="button">Close</button>
            </div>

            <div className="decision-summary">
              <label className="field-block">
                <span>Source question</span>
                <div className="readonly-field">{selected.sourceQuestion}</div>
              </label>
              <label className="field-block">
                <span>Current suggestion</span>
                <div className="readonly-field">{targetLabelFor(selected)}</div>
              </label>
              <div className="field-block">
                <span>Detected source profile</span>
                <div className="readonly-field profile-facts">
                  <span><strong>Type</strong> {sourceVariableType(sourceColumn)}</span>
                  <span><strong>Observed range</strong> {sourceColumn?.detectedScale ? `${sourceColumn.detectedScale.min} to ${sourceColumn.detectedScale.max}` : "not numeric"}</span>
                  <span><strong>Distinct</strong> {sourceColumn?.uniqueCount ?? "-"}</span>
                  <span><strong>Missing</strong> {sourceColumn?.missingCount ?? "-"}</span>
                </div>
              </div>
            </div>

            {scoringMetadataNeedsReview && (
              <p className="file-notice" role="status">
                No source-verified scoring metadata is supplied for this item. Approving it uses an inferred item-level scale and keeps a review warning in the audit.
              </p>
            )}

            <fieldset className="choice-list target-choice-list">
              <legend>Choose destination question</legend>
              {candidates.map((candidate) => {
                const review = candidate.scoringStatus === "SCORING_METADATA_REVIEW_REQUIRED";
                return (
                  <label className={selectedCandidateCode === candidate.code ? "selected" : ""} key={candidate.code}>
                    <input
                      type="radio"
                      name="target"
                      value={candidate.code}
                      checked={selectedCandidateCode === candidate.code}
                      onChange={(event) => {
                        setChoice(event.target.value);
                        setRuleChoice(defaultRuleForCandidate(candidate));
                      }}
                    />
                    <span>
                      <strong>{candidate.label}</strong>
                      <small>{review ? "Inferred scale review" : candidate.code}</small>
                    </span>
                  </label>
                );
              })}
              <label className={choice === "excluded" ? "selected" : ""}>
                <input
                  type="radio"
                  name="target"
                  value="excluded"
                  checked={choice === "excluded"}
                  onChange={(event) => {
                    setChoice(event.target.value);
                    setRuleChoice("");
                  }}
                />
                <span>
                  <strong>Do not harmonise</strong>
                  <small>Keep out of the standardised output</small>
                </span>
              </label>
            </fieldset>

            <label className="field-block">
              <span>Transformation rule</span>
              <select
                aria-label="Transformation rule"
                value={ruleChoice}
                onChange={(event) => setRuleChoice(event.target.value)}
                disabled={choice === "excluded"}
              >
                <option value="">Use the destination default</option>
                {approvedRules.map((rule) => (
                  <option key={`${rule.ruleId}-${rule.version}`} value={rule.ruleId}>
                    {rule.name || rule.ruleId} - {rule.version}
                  </option>
                ))}
              </select>
            </label>

            <div className="button-row end modal-actions">
              <button className="button secondary" onClick={closeDecision} type="button">Cancel</button>
              <button
                className="button dark"
                onClick={saveChoice}
                disabled={busy || (!choice && !selectedCandidateCode)}
                type="button"
              >
                Save mapping decision
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default MappingPage;
