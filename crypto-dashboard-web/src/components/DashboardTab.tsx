import { useCallback, useState } from "react";
import { usePortfolioStore } from "../stores/portfolio";
import { useTradesStore } from "../stores/trades";
import { useSettingsStore } from "../stores/settings";
import { fetchAllPlatformData } from "../services/aggregator";
import PortfolioCard from "./PortfolioCard";
import AssetRow from "./AssetRow";
import ExposureChart from "./ExposureChart";

type SortKey = "value" | "name" | "change";
type ChartMode = "platform" | "asset";

export default function DashboardTab() {
  const {
    holdings, totalValueUsd, change24hUsd, change24hPercent,
    lastRefreshed, loading, error, setHoldings, setLoading, setError,
  } = usePortfolioStore();
  const { setTrades } = useTradesStore();
  const refreshCadRate = useSettingsStore((s) => s.refreshCadRate);

  const [sortBy, setSortBy] = useState<SortKey>("value");
  const [chartMode, setChartMode] = useState<ChartMode>("platform");

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [result] = await Promise.all([
        fetchAllPlatformData(),
        refreshCadRate(),
      ]);
      setHoldings(result.holdings);
      setTrades(result.trades);
      if (result.errors.length > 0) {
        setError(result.errors.map((e) => `${e.platform}: ${e.error}`).join("; "));
      }
    } catch (err: any) {
      setError(err.message ?? "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, []);

  const sortedHoldings = [...holdings].sort((a, b) => {
    if (sortBy === "value") return b.currentValueUsd - a.currentValueUsd;
    if (sortBy === "name") return a.asset.localeCompare(b.asset);
    return b.change24hPercent - a.change24hPercent;
  });

  const isEmpty = holdings.length === 0 && !loading;

  if (isEmpty && !error) {
    return (
      <div className="empty-state">
        <div className="icon">&#x1F4CA;</div>
        <h2>Portfolio Dashboard</h2>
        <p>Connect your wallets in Settings, then click Refresh to load your data.</p>
        <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={handleRefresh}>
          Refresh Data
        </button>
      </div>
    );
  }

  return (
    <div>
      {loading && (
        <div className="loading-bar">
          <div className="spinner">&#x21BB;</div>
          <div className="spinner-text">Loading portfolio...</div>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <span>&#x26A0; {error}</span>
        </div>
      )}

      <PortfolioCard
        totalValueUsd={totalValueUsd}
        change24hUsd={change24hUsd}
        change24hPercent={change24hPercent}
        lastRefreshed={lastRefreshed}
        onRefresh={handleRefresh}
        loading={loading}
      />

      <div className="chart-toggle">
        {(["platform", "asset"] as ChartMode[]).map((mode) => (
          <button
            key={mode}
            className={`chip ${chartMode === mode ? "active" : ""}`}
            onClick={() => setChartMode(mode)}
          >
            By {mode === "platform" ? "Platform" : "Asset"}
          </button>
        ))}
      </div>
      <ExposureChart holdings={holdings} mode={chartMode} />

      <div className="sort-row">
        <h3>Holdings</h3>
        <div className="sort-options">
          {(["value", "name", "change"] as SortKey[]).map((key) => (
            <button
              key={key}
              className={`chip-sm ${sortBy === key ? "active" : ""}`}
              onClick={() => setSortBy(key)}
            >
              {key === "value" ? "Value" : key === "name" ? "Name" : "24h %"}
            </button>
          ))}
        </div>
      </div>

      {sortedHoldings.map((h, i) => (
        <AssetRow key={`${h.platform}-${h.asset}-${i}`} holding={h} />
      ))}
    </div>
  );
}
