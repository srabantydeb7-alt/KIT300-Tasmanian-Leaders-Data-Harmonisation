import React, { useState } from "react";
import "./RuleLibraryPage.css";

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
  const [rules, setRules] = useState([
    {
      id: 1,
      name: "1–5 Likert to 0–100",
      type: "Scale Conversion",
      source: "1–5 Likert",
      target: "0–100",
      rule: "(x - 1) / 4 * 100",
      status: "Active",
    },
    {
      id: 2,
      name: "1–7 Likert to 0–100",
      type: "Scale Conversion",
      source: "1–7 Likert",
      target: "0–100",
      rule: "(x - 1) / 6 * 100",
      status: "Active",
    },
    {
      id: 3,
      name: "Yes / No Conversion",
      type: "Response Conversion",
      source: "Yes / No",
      target: "Binary",
      rule: "Yes = 100, No = 0",
      status: "Review",
    },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const deleteRule = (id) => {
    const updatedRules = rules.filter((rule) => rule.id !== id);
    setRules(updatedRules);
  };

  const openAddModal = () => {
    setEditingId(null);
    setForm(emptyForm);
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
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.rule.trim()) return;

    if (editingId) {
      setRules((prev) =>
        prev.map((r) => (r.id === editingId ? { ...r, ...form } : r))
      );
    } else {
      const nextId =
        rules.length > 0 ? Math.max(...rules.map((r) => r.id)) + 1 : 1;
      setRules((prev) => [...prev, { id: nextId, ...form }]);
    }
    closeModal();
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
      <div className="rule-table-container">
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
                  <button
                    className="edit-button"
                    onClick={() => openEditModal(rule)}
                  >
                    Edit
                  </button>
                  <button
                    className="delete-button"
                    onClick={() => deleteRule(rule.id)}
                  >
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
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingId ? "Edit Rule" : "Add Rule"}</h2>

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
              <button className="cancel-button" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="save-button"
                onClick={handleSave}
                disabled={!form.name.trim() || !form.rule.trim()}
              >
                Save Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RuleLibraryPage;