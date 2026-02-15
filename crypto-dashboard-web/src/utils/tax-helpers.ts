/**
 * Cost basis, gain/loss calculation helpers for tax export.
 */

import { TradeRecord, Platform } from "../types";

export interface TaxSummary {
  totalTradesCount: number;
  totalVolume: number;
  totalRealizedGains: number;
  totalRealizedLosses: number;
  netGainLoss: number;
  byPlatform: Record<string, { count: number; volume: number; netGainLoss: number }>;
  byAsset: Record<string, { count: number; volume: number; netGainLoss: number }>;
  blurLiquidationLoss: number;
}

export function computeTaxSummary(trades: TradeRecord[]): TaxSummary {
  let totalVolume = 0;
  let totalRealizedGains = 0;
  let totalRealizedLosses = 0;
  let blurLiquidationLoss = 0;
  const byPlatform: Record<string, { count: number; volume: number; netGainLoss: number }> = {};
  const byAsset: Record<string, { count: number; volume: number; netGainLoss: number }> = {};

  for (const trade of trades) {
    const volume = trade.totalValueUsd;
    const gainLoss = trade.gainLossUsd ?? 0;

    totalVolume += volume;
    if (gainLoss > 0) totalRealizedGains += gainLoss;
    if (gainLoss < 0) totalRealizedLosses += Math.abs(gainLoss);

    // Track Blur liquidation losses specifically
    if (trade.platform === "blur" && trade.type === "liquidation" && gainLoss < 0) {
      blurLiquidationLoss += Math.abs(gainLoss);
    }

    // By platform
    if (!byPlatform[trade.platform]) {
      byPlatform[trade.platform] = { count: 0, volume: 0, netGainLoss: 0 };
    }
    byPlatform[trade.platform].count++;
    byPlatform[trade.platform].volume += volume;
    byPlatform[trade.platform].netGainLoss += gainLoss;

    // By asset
    if (!byAsset[trade.asset]) {
      byAsset[trade.asset] = { count: 0, volume: 0, netGainLoss: 0 };
    }
    byAsset[trade.asset].count++;
    byAsset[trade.asset].volume += volume;
    byAsset[trade.asset].netGainLoss += gainLoss;
  }

  return {
    totalTradesCount: trades.length,
    totalVolume,
    totalRealizedGains,
    totalRealizedLosses,
    netGainLoss: totalRealizedGains - totalRealizedLosses,
    byPlatform,
    byAsset,
    blurLiquidationLoss,
  };
}
