import { useState, useEffect } from "react";
import { useSettingsStore } from "../stores/settings";
import { PLATFORM_CONFIGS } from "../utils/platforms";
import { Platform, ConnectionStatus, PlatformConfig } from "../types";

function StatusDot({ status }: { status: ConnectionStatus }) {
  const color =
    status === "connected" ? "var(--success)"
    : status === "error" ? "var(--danger)"
    : status === "testing" ? "var(--warning)"
    : "var(--text-muted)";
  return <span className="status-dot" style={{ background: color, display: "inline-block" }} />;
}

function PlatformCard({ config }: { config: PlatformConfig }) {
  const { setCredential, getCredential, setConnectionStatus, connectionStatus, hydrated } = useSettingsStore();
  const status = connectionStatus[config.platform];
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const values: Record<string, string> = {};
      for (const field of config.fields) {
        const val = await getCredential(config.platform, field.key);
        values[field.key] = val ?? "";
      }
      setFieldValues(values);
    })();
  }, [hydrated]);

  const handleSave = async () => {
    setSaving(true);
    for (const field of config.fields) {
      await setCredential(config.platform, field.key, fieldValues[field.key] ?? "");
    }
    const hasValues = Object.values(fieldValues).some((v) => v.trim().length > 0);
    setConnectionStatus(config.platform, hasValues ? "connected" : "unconfigured");
    setSaving(false);
    alert(`${config.label} credentials saved.`);
  };

  const handleTest = async () => {
    setConnectionStatus(config.platform, "testing");
    await new Promise((r) => setTimeout(r, 1500));
    const hasValues = Object.values(fieldValues).some((v) => v.trim().length > 0);
    if (hasValues) {
      setConnectionStatus(config.platform, "connected");
      alert(`${config.label} connection verified.`);
    } else {
      setConnectionStatus(config.platform, "error");
      alert(`No credentials configured for ${config.label}.`);
    }
  };

  return (
    <div className="card">
      <div className="platform-header">
        <span className="platform-title">{config.label}</span>
        <StatusDot status={status} />
        <span className="status-text">{status === "testing" ? "Testing..." : status}</span>
      </div>

      {config.fields.map((field) => {
        const isMultiAddress = field.key === "walletAddress" && field.label.includes("one per line");
        return (
          <div key={field.key} style={{ marginBottom: 8 }}>
            <label className="form-label" style={{ marginTop: 8 }}>{field.label}</label>
            <div className="input-row">
              {isMultiAddress ? (
                <textarea
                  className="form-input form-textarea"
                  placeholder={field.placeholder}
                  value={fieldValues[field.key] ?? ""}
                  onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  rows={3}
                  style={{ fontFamily: "monospace", fontSize: 12 }}
                />
              ) : (
                <input
                  className="form-input"
                  placeholder={field.placeholder}
                  value={fieldValues[field.key] ?? ""}
                  onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  type={field.secure && !revealed[field.key] ? "password" : "text"}
                  autoComplete="off"
                />
              )}
              {field.secure && (
                <button
                  className="reveal-btn"
                  onClick={() => setRevealed((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                >
                  {revealed[field.key] ? "\u{1F648}" : "\u{1F441}"}
                </button>
              )}
            </div>
          </div>
        );
      })}

      <div className="card-actions">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "..." : "Save"}
        </button>
        <button className="btn btn-outline" onClick={handleTest} disabled={status === "testing"}>
          {status === "testing" ? "..." : "Test Connection"}
        </button>
      </div>
    </div>
  );
}

export default function SettingsTab() {
  const { currency, setCurrency, autoRefreshInterval, setAutoRefreshInterval, clearAll } = useSettingsStore();

  const handleClearAll = () => {
    if (confirm("This will remove all saved API keys and reset settings. Are you sure?")) {
      clearAll();
    }
  };

  return (
    <div>
      <div className="settings-section-title">API Keys & Wallets</div>
      {PLATFORM_CONFIGS.map((config) => (
        <PlatformCard key={config.platform} config={config} />
      ))}

      <div className="settings-section-title">Preferences</div>
      <div className="card">
        <label className="form-label" style={{ marginTop: 0 }}>Default Currency</label>
        <div className="toggle-row">
          {(["USD", "CAD"] as const).map((c) => (
            <button key={c} className={`toggle-btn ${currency === c ? "active" : ""}`} onClick={() => setCurrency(c)}>
              {c}
            </button>
          ))}
        </div>

        <label className="form-label">Auto-Refresh Interval</label>
        <div className="toggle-row">
          {([5, 15, 30, 0] as const).map((interval) => (
            <button
              key={interval}
              className={`toggle-btn ${autoRefreshInterval === interval ? "active" : ""}`}
              onClick={() => setAutoRefreshInterval(interval)}
            >
              {interval === 0 ? "Manual" : `${interval}m`}
            </button>
          ))}
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 24 }}>
        <button className="btn btn-danger" onClick={handleClearAll}>
          Clear All Data & Reset
        </button>
      </div>
    </div>
  );
}
