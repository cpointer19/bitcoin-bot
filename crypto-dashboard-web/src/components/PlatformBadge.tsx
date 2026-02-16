import { Platform } from "../types";

const LABELS: Record<Platform, string> = {
  "crypto.com": "Crypto.com",
  hyperliquid: "Hyperliquid",
  blur: "Blur",
  ethereum: "Ethereum",
  solana: "Solana",
  bitcoin: "Bitcoin",
  other: "Other",
};

const COLORS: Record<Platform, string> = {
  "crypto.com": "#1A3C6D",
  hyperliquid: "#3A1D6E",
  blur: "#FF6B00",
  ethereum: "#627EEA",
  solana: "#9945FF",
  bitcoin: "#F7931A",
  other: "#606070",
};

export default function PlatformBadge({ platform }: { platform: Platform }) {
  const color = COLORS[platform];
  return (
    <span
      className="platform-badge"
      style={{ background: color + "30", color }}
    >
      {LABELS[platform]}
    </span>
  );
}
