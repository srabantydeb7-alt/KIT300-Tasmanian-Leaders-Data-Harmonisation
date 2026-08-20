import React, { useState, useEffect, useCallback } from "react";
import "./RuleLibraryPage.css";

const API_BASE = "http://localhost:5000/api/rules";

const TYPE_OPTIONS = ["Scale Conversion", "Response Conversion", "Mapping Rule"];
const STATUS_OPTIONS = ["Active", "Review", "Draft"];

const emptyForm = {
  name: "",
  type: "Scale Conversion",
  source: "",
  target: "",
  rule: "",
  status: "Draft",
};

function RuleLibraryPage() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // ---- Load rules from the backend ----
  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(API_BASE);
      if (!res.ok) throw new Error(`Failed to load rules (${res.status})`);
      const data = await res.json();
      setRules(data);
    } catch (err) {
      setError(err.message || "Could not load rules from the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // ---- Delete ----
  const deleteRule = async (id) => {
    const previous = [...rules];
    setRules((prev) => prev.filter((rule) => rule.id !== id)); // optimistic
    try {
      const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to delete rule (${res.status})`);
    } catch (err) {
      setRules(previous); // roll back
      setError(err.message || "Could not delete the rule.");
    }
  };

  // ---- Modal open/close ----
  const openAddModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (rule) => {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      type: rule.type,
      source: rule.source,
      target: rule.target,
      rule: rule.rule,
      status: rule.status,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return; // don't let them close mid-save
    setIsModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
  };

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  // ---- Save (create or update) ----
  const handleSave = async () => {
    if (!form.name.trim() || !form.source.trim() || !form.target.trim() || !form.rule.trim()) {
      setFormError("Name, source, target and rule details are required.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      if (editingId) {
        const res = await fetch(`${API_BASE}/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || `Failed to update rule (${res.status})`);
        }
        const updated = await res.json();
        setRules((prev) => prev.map((r) => (r.id === editingId ? updated : r)));
      } else {
        const res = await fetch(API_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || `Failed to create rule (${res.status})`);
        }
        const created = await res.json();
        setRules((prev) => [...prev, created]);
      }
      setIsModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    } catch (err) {
      setFormError(err.message || "Something went wrong saving the rule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rule-library-page">
      <div className="rule-library-header">
        <div>
          <h1>Rule Library</h1>
          <p>
            Manage reusable harmonisation rules for mapping and response
            conversion.
          </p>
        </div>
        <button className="add-rule-button" onClick={openAddModal}>
          + Add Rule
        </button>
      </div>

      {error && (
        <div className="page-error">
          {error}{" "}
          <button className="retry-button" onClick={fetchRules}>
            Retry
          </button>
        </div>
      )}

      <div className="rule-table-container">
        {loading ? (
          <div className="loading-state">Loading rules…</div>
        ) : (
          <table className="rule-table">
            <thead>
              <tr>
                <th>Rule Name</th>
                <th>Type</th>
                <th>Source</th>
                <th>Target</th>
                <th>Rule Details</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.name}</td>
                  <td>{rule.type}</td>
                  <td>{rule.source}</td>
                  <td>{rule.target}</td>
                  <td>{rule.rule}</td>
                  <td>
                    <span className={`status ${rule.status.toLowerCase()}`}>
                      {rule.status}
                    </span>
                  </td>
                  <td>
                    <button className="edit-button" onClick={() => openEditModal(rule)}>
                      Edit
                    </button>
                    <button className="delete-button" onClick={() => deleteRule(rule.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-row">
                    No rules yet. Click "+ Add Rule" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingId ? "Edit Rule" : "Add Rule"}</h2>

            {formError && <div className="form-error">{formError}</div>}

            <div className="form-group">
              <label>Rule Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={handleChange("name")}
                placeholder="e.g. 1–5 Likert to 0–100"
              />
            </div>

            <div className="form-group">
              <label>Type *</label>
              <select value={form.type} onChange={handleChange("type")}>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Source *</label>
                <input
                  type="text"
                  value={form.source}
                  onChange={handleChange("source")}
                  placeholder="e.g. 1–5 Likert"
                />
              </div>
              <div className="form-group">
                <label>Target *</label>
                <input
                  type="text"
                  value={form.target}
                  onChange={handleChange("target")}
                  placeholder="e.g. 0–100"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Rule Details *</label>
              <input
                type="text"
                value={form.rule}
                onChange={handleChange("rule")}
                placeholder="e.g. (x - 1) / 4 * 100"
              />
            </div>

            <div className="form-group">
              <label>Status *</label>
              <select value={form.status} onChange={handleChange("status")}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-actions">
              <button className="cancel-button" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button className="save-button" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save Rule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RuleLibraryPage;