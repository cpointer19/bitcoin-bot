/**
 * Hyperliquid API service.
 * Base URL: https://api.hyperliquid.xyz/info
 * Auth: None for read — just POST with wallet address.
 * Perps-heavy: positions include unrealized PnL.
 */

import { TradeRecord, PortfolioHolding } from "../types";
import { fetchPrices, getCoingeckoId } from "./coingecko";

const BASE_URL = "https://api.hyperliquid.xyz/info";

interface HyperliquidConfig {
  walletAddress: string;
}

async function postInfo(body: Record<string, any>): Promise<any> {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Hyperliquid API error: ${response.status}`);
  }

  return response.json();
}

export async function fetchClearinghouseState(
  config: HyperliquidConfig
): Promise<{
  positions: PortfolioHolding[];
  marginSummary: { accountValue: number; totalMarginUsed: number };
}> {
  const data = await postInfo({
    type: "clearinghouseState",
    user: config.walletAddress,
  });

  const marginSummary = {
    accountValue: Number(data.marginSummary?.accountValue ?? 0),
    totalMarginUsed: Number(data.marginSummary?.totalMarginUsed ?? 0),
  };

  const positions: PortfolioHolding[] = (data.assetPositions ?? [])
    .filter((p: any) => {
      const pos = p.position;
      return pos && Number(pos.szi) !== 0;
    })
    .map((p: any) => {
      const pos = p.position;
      const size = Math.abs(Number(pos.szi));
      const entryPx = Number(pos.entryPx) || 0;
      const positionValue = Number(pos.positionValue) || size * entryPx;
      const unrealizedPnl = Number(pos.unrealizedPnl) || 0;
      const returnOnEquity = Number(pos.returnOnEquity) || 0;

      return {
        asset: pos.coin,
        platform: "hyperliquid" as const,
        amount: size,
        currentPriceUsd: entryPx,
        currentValueUsd: positionValue,
        change24hPercent: returnOnEquity * 100,
        unrealizedPnlUsd: unrealizedPnl,
      };
    });

  return { positions, marginSummary };
}

export async function fetchSpotBalances(
  config: HyperliquidConfig
): Promise<PortfolioHolding[]> {
  const data = await postInfo({
    type: "spotClearinghouseState",
    user: config.walletAddress,
  });

  const balances: any[] = data.balances ?? [];

  // Get prices for spot holdings
  const coinIds: string[] = [];
  const symbolToId: Record<string, string> = {};
  for (const bal of balances) {
    const id = getCoingeckoId(bal.coin);
    if (id) {
      coinIds.push(id);
      symbolToId[bal.coin] = id;
    }
  }
  const prices = coinIds.length > 0 ? await fetchPrices(coinIds) : {};

  return balances
    .filter((b) => Number(b.total) > 0)
    .map((b) => {
      const amount = Number(b.total);
      const id = symbolToId[b.coin];
      const price = id ? prices[id] : undefined;

      return {
        asset: b.coin,
        platform: "hyperliquid" as const,
        amount,
        currentPriceUsd: price?.usd ?? 0,
        currentValueUsd: amount * (price?.usd ?? 0),
        change24hPercent: price?.usd_24h_change ?? 0,
      };
    });
}

export async function fetchUserFills(
  config: HyperliquidConfig
): Promise<TradeRecord[]> {
  const data = await postInfo({
    type: "userFills",
    user: config.walletAddress,
  });

  const fills: any[] = Array.isArray(data) ? data : [];

  return fills.map((fill) => {
    const isBuy = fill.side === "B";
    const amount = Math.abs(Number(fill.sz) || 0);
    const price = Number(fill.px) || 0;

    return {
      id: `hl-${fill.tid ?? fill.oid ?? Date.now()}`,
      date: new Date(Number(fill.time)).toISOString(),
      platform: "hyperliquid" as const,
      type: isBuy ? ("buy" as const) : ("sell" as const),
      asset: fill.coin,
      amount,
      priceUsd: price,
      totalValueUsd: amount * price,
      feesUsd: Number(fill.fee) || 0,
      source: "api" as const,
      notes: fill.liquidation ? "Liquidation" : undefined,
      raw: fill,
    };
  });
}

export async function fetchHyperliquidHoldings(
  config: HyperliquidConfig
): Promise<PortfolioHolding[]> {
  const [{ positions }, spotBalances] = await Promise.all([
    fetchClearinghouseState(config),
    fetchSpotBalances(config).catch(() => []),
  ]);

  return [...positions, ...spotBalances];
}

export async function fetchHyperliquidTrades(
  config: HyperliquidConfig
): Promise<TradeRecord[]> {
  return fetchUserFills(config);
}
