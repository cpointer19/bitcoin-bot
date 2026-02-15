import { PortfolioHolding, Platform } from "../types";
import { formatUsd } from "../utils/formatters";

const PLATFORM_COLORS: Record<Platform, string> = {
  "crypto.com": "#1A6CDB",
  hyperliquid: "#7B3FE4",
  blur: "#FF6B00",
  ethereum: "#627EEA",
  solana: "#14F195",
  other: "#A0A0B0",
};

const PLATFORM_LABELS: Record<Platform, string> = {
  "crypto.com": "Crypto.com",
  hyperliquid: "Hyperliquid",
  blur: "Blur",
  ethereum: "Ethereum",
  solana: "Solana",
  other: "Other",
};

const ASSET_COLORS = [
  "#627EEA", "#14F195", "#FF6B00", "#7B3FE4",
  "#1A6CDB", "#FDCB6E", "#FF6B6B", "#00D2D3",
];

interface Props {
  holdings: PortfolioHolding[];
  mode: "platform" | "asset";
}

export default function ExposureChart({ holdings, mode }: Props) {
  if (holdings.length === 0) return null;

  let segments: { name: string; value: number; color: string }[];

  if (mode === "platform") {
    const byPlatform: Record<string, number> = {};
    for (const h of holdings) {
      byPlatform[h.platform] = (byPlatform[h.platform] ?? 0) + h.currentValueUsd;
    }
    segments = Object.entries(byPlatform)
      .sort((a, b) => b[1] - a[1])
      .map(([platform, value], i) => ({
        name: PLATFORM_LABELS[platform as Platform] ?? platform,
        value,
        color: PLATFORM_COLORS[platform as Platform] ?? ASSET_COLORS[i % ASSET_COLORS.length],
      }));
  } else {
    const byAsset: Record<string, number> = {};
    for (const h of holdings) {
      byAsset[h.asset] = (byAsset[h.asset] ?? 0) + h.currentValueUsd;
    }
    segments = Object.entries(byAsset)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([asset, value], i) => ({
        name: asset,
        value,
        color: ASSET_COLORS[i % ASSET_COLORS.length],
      }));
  }

  segments = segments.filter((d) => d.value > 0);
  if (segments.length === 0) return null;

  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="card exposure-chart">
      <div className="title">
        Exposure by {mode === "platform" ? "Platform" : "Asset"}
      </div>
      <div className="stacked-bar">
        {segments.map((seg) => {
          const pct = (seg.value / total) * 100;
          if (pct < 0.5) return null;
          return (
            <div
              key={seg.name}
              style={{ flex: pct, background: seg.color, minWidth: 2 }}
            />
          );
        })}
      </div>
      <div className="legend">
        {segments.map((seg) => {
          const pct = ((seg.value / total) * 100).toFixed(1);
          return (
            <div key={seg.name} className="legend-row">
              <div className="legend-dot" style={{ background: seg.color }} />
              <span className="legend-name">{seg.name}</span>
              <span className="legend-pct">{pct}%</span>
              <span className="legend-value">{formatUsd(seg.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
