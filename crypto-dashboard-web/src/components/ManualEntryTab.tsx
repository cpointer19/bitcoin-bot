import { useState } from "react";
import { useManualEntriesStore } from "../stores/manual-entries";
import ManualEntryForm from "./ManualEntryForm";
import { ManualEntry } from "../types";
import { useFormatCurrency, formatDate } from "../utils/formatters";

const BLUR_TEMPLATE: Partial<ManualEntry> = {
  platform: "blur",
  type: "liquidation",
  notes: "Blur NFT liquidation",
};

type Mode = "list" | "create" | "edit";

export default function ManualEntryTab() {
  const { entries, addEntry, updateEntry, deleteEntry } = useManualEntriesStore();
  const [mode, setMode] = useState<Mode>("list");
  const [editingEntry, setEditingEntry] = useState<ManualEntry | null>(null);
  const [template, setTemplate] = useState<Partial<ManualEntry> | undefined>();

  const handleCreate = (tmpl?: Partial<ManualEntry>) => {
    setTemplate(tmpl);
    setEditingEntry(null);
    setMode("create");
  };

  const handleEdit = (entry: ManualEntry) => {
    setEditingEntry(entry);
    setTemplate(undefined);
    setMode("edit");
  };

  const handleSave = async (entry: ManualEntry) => {
    if (mode === "edit") await updateEntry(entry.id, entry);
    else await addEntry(entry);
    setMode("list");
    setEditingEntry(null);
    setTemplate(undefined);
  };

  const handleDelete = (entry: ManualEntry) => {
    if (confirm(`Delete "${entry.asset}" ${entry.type} entry?`)) {
      deleteEntry(entry.id);
    }
  };

  const handleCancel = () => {
    setMode("list");
    setEditingEntry(null);
    setTemplate(undefined);
  };

  if (mode === "create" || mode === "edit") {
    return (
      <ManualEntryForm
        initialValues={mode === "edit" ? editingEntry ?? undefined : template}
        onSave={handleSave}
        onCancel={handleCancel}
        isEditing={mode === "edit"}
      />
    );
  }

  return (
    <div>
      <div className="action-bar">
        <button className="btn btn-primary" onClick={() => handleCreate()}>
          + New Entry
        </button>
        <button
          className="btn btn-outline"
          style={{ borderColor: "var(--warning)", color: "var(--warning)" }}
          onClick={() => handleCreate(BLUR_TEMPLATE)}
        >
          Quick Add Liquidation
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">
          <div className="icon">&#x270F;</div>
          <h2>No Manual Entries</h2>
          <p>Add custom transactions that don't appear via API - like the Blur NFT liquidation loss.</p>
        </div>
      ) : (
        entries.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            onEdit={() => handleEdit(entry)}
            onDelete={() => handleDelete(entry)}
          />
        ))
      )}
    </div>
  );
}

function EntryCard({ entry, onEdit, onDelete }: { entry: ManualEntry; onEdit: () => void; onDelete: () => void }) {
  const fmt = useFormatCurrency();
  const typeColor =
    entry.type === "liquidation" || entry.type === "sell"
      ? "var(--danger)"
      : entry.type === "buy"
        ? "var(--success)"
        : "var(--primary-light)";

  return (
    <div className="entry-card">
      <div className="entry-header">
        <div className="entry-title-row">
          <span className="entry-asset">{entry.asset}</span>
          <span className="type-badge" style={{ background: typeColor + "20", color: typeColor }}>
            {entry.type.toUpperCase()}
          </span>
          <span className="custom-badge">Custom</span>
        </div>
        <div className="entry-date">{formatDate(entry.date)}</div>
      </div>
      <div className="entry-body">
        <div className="entry-row">
          <span className="entry-label">Amount</span>
          <span className="entry-value">{entry.amount} {entry.asset}</span>
        </div>
        {entry.totalValueUsd > 0 && (
          <div className="entry-row">
            <span className="entry-label">Value</span>
            <span className="entry-value">{fmt(entry.totalValueUsd)}</span>
          </div>
        )}
        {entry.gainLossUsd != null && entry.gainLossUsd !== 0 && (
          <div className="entry-row">
            <span className="entry-label">Gain/Loss</span>
            <span className="entry-value" style={{ color: entry.gainLossUsd >= 0 ? "var(--success)" : "var(--danger)" }}>
              {entry.gainLossUsd >= 0 ? "+" : ""}{fmt(entry.gainLossUsd)}
            </span>
          </div>
        )}
        {entry.notes && <div className="entry-notes">{entry.notes}</div>}
      </div>
      <div className="entry-actions">
        <button onClick={onEdit}>Edit</button>
        <button onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}
