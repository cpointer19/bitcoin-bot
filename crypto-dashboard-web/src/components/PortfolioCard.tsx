import { formatUsd, formatPercent, timeAgo } from "../utils/formatters";

interface Props {
  totalValueUsd: number;
  change24hUsd: number;
  change24hPercent: number;
  lastRefreshed: string | null;
  onRefresh: () => void;
  loading: boolean;
}

export default function PortfolioCard({
  totalValueUsd, change24hUsd, change24hPercent, lastRefreshed, onRefresh, loading,
}: Props) {
  const isPositive = change24hPercent >= 0;
  const changeColor = isPositive ? "var(--success)" : "var(--danger)";

  return (
    <div className="card portfolio-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="label">Total Portfolio Value</div>
          <div className="value">{formatUsd(totalValueUsd)}</div>
        </div>
        <button
          className="btn btn-primary"
          onClick={onRefresh}
          disabled={loading}
          style={{ fontSize: 13, padding: "8px 16px" }}
        >
          {loading ? "..." : "Refresh"}
        </button>
      </div>
      <div className="change-row">
        <span className="change-amount" style={{ color: changeColor }}>
          {isPositive ? "+" : ""}{formatUsd(change24hUsd)}
        </span>
        <span
          className="change-badge"
          style={{ background: changeColor + "20", color: changeColor }}
        >
          {formatPercent(change24hPercent)}
        </span>
        <span className="change-label">24h</span>
      </div>
      {lastRefreshed && (
        <div className="refreshed">Updated {timeAgo(lastRefreshed)}</div>
      )}
    </div>
  );
}
