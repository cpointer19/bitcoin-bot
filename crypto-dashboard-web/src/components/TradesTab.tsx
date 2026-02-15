import { useState, useMemo } from "react";
import { useTradesStore } from "../stores/trades";
import { useManualEntriesStore } from "../stores/manual-entries";
import TradeRow from "./TradeRow";
import { TradeRecord, Platform, TradeType } from "../types";
import { exportTrades2025 } from "../utils/excel-export";

type PlatformFilter = "all" | Platform;
type TypeFilter = "all" | TradeType | "custom";
type DateFilter = "all" | "ytd" | "q1" | "q2" | "q3" | "q4" | "2025";

const PLATFORM_OPTIONS: { value: PlatformFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "crypto.com", label: "Crypto.com" },
  { value: "hyperliquid", label: "Hyperliquid" },
  { value: "blur", label: "Blur" },
  { value: "ethereum", label: "ETH" },
  { value: "solana", label: "SOL" },
];

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "swap", label: "Swap" },
  { value: "transfer", label: "Transfer" },
  { value: "liquidation", label: "Liquidation" },
  { value: "custom", label: "Custom" },
];

const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "2025", label: "2025" },
  { value: "ytd", label: "YTD" },
  { value: "q1", label: "Q1" },
  { value: "q2", label: "Q2" },
  { value: "q3", label: "Q3" },
  { value: "q4", label: "Q4" },
];

function getDateRange(filter: DateFilter): { start: Date; end: Date } | null {
  const now = new Date();
  const year = now.getFullYear();
  switch (filter) {
    case "all": return null;
    case "ytd": return { start: new Date(year, 0, 1), end: now };
    case "2025": return { start: new Date(2025, 0, 1), end: new Date(2025, 11, 31, 23, 59, 59) };
    case "q1": return { start: new Date(year, 0, 1), end: new Date(year, 2, 31, 23, 59, 59) };
    case "q2": return { start: new Date(year, 3, 1), end: new Date(year, 5, 30, 23, 59, 59) };
    case "q3": return { start: new Date(year, 6, 1), end: new Date(year, 8, 30, 23, 59, 59) };
    case "q4": return { start: new Date(year, 9, 1), end: new Date(year, 11, 31, 23, 59, 59) };
    default: return null;
  }
}

export default function TradesTab() {
  const { trades } = useTradesStore();
  const { entries: manualEntries } = useManualEntriesStore();

  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [exporting, setExporting] = useState(false);

  const allTrades: TradeRecord[] = useMemo(() => {
    return [...trades, ...manualEntries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [trades, manualEntries]);

  const filteredTrades = useMemo(() => {
    let result = allTrades;
    if (platformFilter !== "all") result = result.filter((t) => t.platform === platformFilter);
    if (typeFilter === "custom") result = result.filter((t) => t.source === "manual");
    else if (typeFilter !== "all") result = result.filter((t) => t.type === typeFilter);
    const dateRange = getDateRange(dateFilter);
    if (dateRange) {
      result = result.filter((t) => {
        const d = new Date(t.date);
        return d >= dateRange.start && d <= dateRange.end;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.asset.toLowerCase().includes(q) ||
          t.txHash?.toLowerCase().includes(q) ||
          t.notes?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [allTrades, platformFilter, typeFilter, dateFilter, searchQuery]);

  const handleExport = async () => {
    setExporting(true);
    try { await exportTrades2025(allTrades); }
    catch (err: any) { alert(err.message ?? "Export failed"); }
    finally { setExporting(false); }
  };

  if (allTrades.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">&#x1F4B1;</div>
        <h2>Transaction History</h2>
        <p>Your trades across all platforms will appear here. Connect wallets in Settings and refresh the Dashboard, or add manual entries.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="search-bar">
        <span className="search-icon">&#x1F50D;</span>
        <input
          placeholder="Search asset or tx hash..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button style={{ background: "transparent", color: "var(--text-muted)" }} onClick={() => setSearchQuery("")}>
            &#x2715;
          </button>
        )}
      </div>

      <button
        className="btn btn-success"
        style={{ width: "100%", marginBottom: 8 }}
        onClick={handleExport}
        disabled={exporting}
      >
        {exporting ? "Exporting..." : "Export 2025 Trades (.xlsx)"}
      </button>

      <div className="filter-row">
        {PLATFORM_OPTIONS.map((opt) => (
          <button key={opt.value} className={`chip-sm ${platformFilter === opt.value ? "active" : ""}`} onClick={() => setPlatformFilter(opt.value)}>
            {opt.label}
          </button>
        ))}
      </div>
      <div className="filter-row">
        {TYPE_OPTIONS.map((opt) => (
          <button key={opt.value} className={`chip-sm ${typeFilter === opt.value ? "active" : ""}`} onClick={() => setTypeFilter(opt.value)}>
            {opt.label}
          </button>
        ))}
      </div>
      <div className="filter-row">
        {DATE_OPTIONS.map((opt) => (
          <button key={opt.value} className={`chip-sm ${dateFilter === opt.value ? "active" : ""}`} onClick={() => setDateFilter(opt.value)}>
            {opt.label}
          </button>
        ))}
      </div>

      <div className="result-count">
        {filteredTrades.length} trade{filteredTrades.length !== 1 ? "s" : ""}
      </div>

      {filteredTrades.length === 0 ? (
        <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
          No trades match your filters.
        </div>
      ) : (
        filteredTrades.map((trade) => <TradeRow key={trade.id} trade={trade} />)
      )}
    </div>
  );
}
