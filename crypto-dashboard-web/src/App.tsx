import { useEffect, useState } from "react";
import { useSettingsStore } from "./stores/settings";
import { useManualEntriesStore } from "./stores/manual-entries";
import DashboardTab from "./components/DashboardTab";
import TradesTab from "./components/TradesTab";
import ManualEntryTab from "./components/ManualEntryTab";
import SettingsTab from "./components/SettingsTab";

type Tab = "dashboard" | "trades" | "manual" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "trades", label: "Trades" },
  { id: "manual", label: "Manual Entry" },
  { id: "settings", label: "Settings" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const hydrateManualEntries = useManualEntriesStore((s) => s.hydrate);

  useEffect(() => {
    hydrateSettings();
    hydrateManualEntries();
  }, []);

  return (
    <div className="app">
      <nav className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="tab-content">
        {activeTab === "dashboard" && <DashboardTab />}
        {activeTab === "trades" && <TradesTab />}
        {activeTab === "manual" && <ManualEntryTab />}
        {activeTab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}
