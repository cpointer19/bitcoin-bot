import { PortfolioHolding } from "../types";
import PlatformBadge from "./PlatformBadge";
import { useFormatCurrency, formatPercent, formatAmount } from "../utils/formatters";

const ASSET_ICONS: Record<string, string> = {
  BTC: "\u20BF",
  ETH: "\u2666",
  SOL: "\u26A1",
  USDT: "$",
  USDC: "$",
};

export default function AssetRow({ holding }: { holding: PortfolioHolding }) {
  const fmt = useFormatCurrency();
  const isPositive = holding.change24hPercent >= 0;
  const changeColor = isPositive ? "var(--success)" : "var(--danger)";
  const icon = ASSET_ICONS[holding.asset.toUpperCase()] ?? "\u25CB";

  return (
    <div className="asset-row">
      <div className="asset-icon">{icon}</div>
      <div className="asset-info">
        <div className="asset-name-row">
          <span className="asset-name">{holding.asset}</span>
          <PlatformBadge platform={holding.platform} />
        </div>
        <div className="asset-amount">
          {formatAmount(holding.amount)} {holding.asset}
        </div>
      </div>
      <div className="asset-values">
        <div className="asset-value">{fmt(holding.currentValueUsd)}</div>
        <div className="asset-change" style={{ color: changeColor }}>
          {formatPercent(holding.change24hPercent)}
        </div>
      </div>
    </div>
  );
}
