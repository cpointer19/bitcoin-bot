export type Platform =
  | "crypto.com"
  | "hyperliquid"
  | "blur"
  | "ethereum"
  | "solana"
  | "other";

export type TradeType =
  | "buy"
  | "sell"
  | "swap"
  | "transfer"
  | "liquidation"
  | "airdrop"
  | "other";

export interface TradeRecord {
  id: string;
  date: string;
  platform: Platform;
  type: TradeType;
  asset: string;
  amount: number;
  priceUsd: number;
  totalValueUsd: number;
  feesUsd: number;
  costBasisUsd?: number;
  gainLossUsd?: number;
  txHash?: string;
  source: "api" | "manual";
  notes?: string;
  raw?: any;
}

export interface PortfolioHolding {
  asset: string;
  platform: Platform;
  amount: number;
  currentPriceUsd: number;
  currentValueUsd: number;
  change24hPercent: number;
  unrealizedPnlUsd?: number;
}

export interface ManualEntry extends TradeRecord {
  source: "manual";
  createdAt: string;
  updatedAt: string;
}

export interface PlatformConfig {
  platform: Platform;
  label: string;
  icon: string;
  fields: PlatformField[];
}

export interface PlatformField {
  key: string;
  label: string;
  placeholder: string;
  secure: boolean;
}

export type ConnectionStatus = "connected" | "error" | "unconfigured" | "testing";
