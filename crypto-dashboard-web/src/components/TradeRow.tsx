import { useState } from "react";
import { TradeRecord } from "../types";
import PlatformBadge from "./PlatformBadge";
import { useFormatCurrency, formatAmount, formatDate, formatTime } from "../utils/formatters";

const TYPE_COLORS: Record<string, string> = {
  buy: "var(--success)", sell: "var(--danger)", swap: "var(--accent)",
  transfer: "var(--primary-light)", liquidation: "var(--danger)",
  airdrop: "var(--warning)", other: "var(--text-muted)",
};

const TYPE_ICONS: Record<string, string> = {
  buy: "\u2193", sell: "\u2191", swap: "\u21C4", transfer: "\u2192",
  liquidation: "\u26A0", airdrop: "\u{1F381}", other: "\u25CB",
};

export default function TradeRow({ trade }: { trade: TradeRecord }) {
  const fmt = useFormatCurrency();
  const [expanded, setExpanded] = useState(false);
  const typeColor = TYPE_COLORS[trade.type] ?? "var(--text-muted)";
  const typeIcon = TYPE_ICONS[trade.type] ?? "\u25CB";
  const isManual = trade.source === "manual";

  const openTxHash = () => {
    if (!trade.txHash) return;
    let url: string | undefined;
    if (trade.platform === "ethereum") url = `https://etherscan.io/tx/${trade.txHash}`;
    else if (trade.platform === "solana") url = `https://solscan.io/tx/${trade.txHash}`;
    if (url) window.open(url, "_blank");
  };

  return (
    <div className="trade-row" onClick={() => setExpanded(!expanded)}>
      <div className="trade-main">
        <div className="trade-type-icon" style={{ background: typeColor + "20" }}>
          <span style={{ color: typeColor }}>{typeIcon}</span>
        </div>
        <div className="trade-info">
          <div className="trade-name-row">
            <span className="trade-asset">{trade.asset}</span>
            <span className="type-badge" style={{ background: typeColor + "20", color: typeColor }}>
              {trade.type.toUpperCase()}
            </span>
            {isManual && <span className="custom-badge">Custom</span>}
          </div>
          <div className="trade-meta">
            <span className="trade-date">{formatDate(trade.date)}</span>
            <PlatformBadge platform={trade.platform} />
          </div>
        </div>
        <div className="trade-values">
          <div className="trade-amount">{formatAmount(trade.amount)} {trade.asset}</div>
          <div className="trade-value">{trade.totalValueUsd > 0 ? fmt(trade.totalValueUsd) : "\u2014"}</div>
          {trade.gainLossUsd != null && trade.gainLossUsd !== 0 && (
            <div className="trade-gain" style={{ color: trade.gainLossUsd >= 0 ? "var(--success)" : "var(--danger)" }}>
              {trade.gainLossUsd >= 0 ? "+" : ""}{fmt(trade.gainLossUsd)}
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="trade-details" onClick={(e) => e.stopPropagation()}>
          <div className="detail-line">
            <span className="detail-label">Date & Time</span>
            <span className="detail-value">{formatDate(trade.date)} {formatTime(trade.date)}</span>
          </div>
          <div className="detail-line">
            <span className="detail-label">Price</span>
            <span className="detail-value">{trade.priceUsd > 0 ? fmt(trade.priceUsd) : "\u2014"}</span>
          </div>
          <div className="detail-line">
            <span className="detail-label">Total Value</span>
            <span className="detail-value">{trade.totalValueUsd > 0 ? fmt(trade.totalValueUsd) : "\u2014"}</span>
          </div>
          <div className="detail-line">
            <span className="detail-label">Fees</span>
            <span className="detail-value">{trade.feesUsd > 0 ? fmt(trade.feesUsd) : "\u2014"}</span>
          </div>
          {trade.costBasisUsd != null && (
            <div className="detail-line">
              <span className="detail-label">Cost Basis</span>
              <span className="detail-value">{fmt(trade.costBasisUsd)}</span>
            </div>
          )}
          {trade.gainLossUsd != null && (
            <div className="detail-line">
              <span className="detail-label">Gain/Loss</span>
              <span className="detail-value">{fmt(trade.gainLossUsd)}</span>
            </div>
          )}
          {trade.txHash && (
            <div className="detail-line">
              <span className="detail-label">TX Hash</span>
              <a className="tx-link" onClick={openTxHash}>
                {trade.txHash.slice(0, 10)}...{trade.txHash.slice(-6)}
              </a>
            </div>
          )}
          {trade.notes && (
            <div className="detail-line">
              <span className="detail-label">Notes</span>
              <span className="detail-value">{trade.notes}</span>
            </div>
          )}
          <div className="detail-line">
            <span className="detail-label">Source</span>
            <span className="detail-value">{trade.source === "manual" ? "Manual Entry" : "API"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
