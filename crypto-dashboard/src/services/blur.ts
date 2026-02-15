/**
 * Blur / NFT service via Reservoir API (reservoir.tools).
 * Aggregates NFT marketplace data including Blur.
 * Free tier available. Falls back to manual entries for anything the API misses.
 */

import { TradeRecord, PortfolioHolding } from "../types";

const RESERVOIR_BASE = "https://api.reservoir.tools";

interface BlurConfig {
  walletAddress: string;
  reservoirApiKey?: string;
}

function buildHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

export async function fetchNftHoldings(
  config: BlurConfig
): Promise<PortfolioHolding[]> {
  const url = `${RESERVOIR_BASE}/users/${config.walletAddress}/tokens/v10?limit=50&includeLastSale=true`;

  const response = await fetch(url, {
    headers: buildHeaders(config.reservoirApiKey),
  });

  if (!response.ok) {
    throw new Error(`Reservoir API error: ${response.status}`);
  }

  const data = await response.json();
  const tokens: any[] = data.tokens ?? [];

  // Group NFTs by collection for portfolio display
  const collections: Record<
    string,
    { name: string; count: number; totalValueEth: number }
  > = {};

  for (const t of tokens) {
    const token = t.token ?? {};
    const ownership = t.ownership ?? {};
    const collectionName = token.collection?.name ?? "Unknown Collection";
    const collectionId = token.collection?.id ?? "unknown";
    const floorPrice = Number(token.collection?.floorAskPrice?.amount?.decimal ?? 0);
    const quantity = Number(ownership.tokenCount ?? 1);

    if (!collections[collectionId]) {
      collections[collectionId] = {
        name: collectionName,
        count: 0,
        totalValueEth: 0,
      };
    }
    collections[collectionId].count += quantity;
    collections[collectionId].totalValueEth += floorPrice * quantity;
  }

  // We need ETH price to convert to USD — use a rough estimate or rely on the aggregator
  // For now, return holdings with ETH values and let the aggregator enrich with USD
  return Object.values(collections).map((col) => ({
    asset: `NFT: ${col.name}`,
    platform: "blur" as const,
    amount: col.count,
    currentPriceUsd: 0, // Will be enriched by aggregator with ETH price
    currentValueUsd: 0, // Placeholder — needs ETH->USD conversion
    change24hPercent: 0,
    _ethValue: col.totalValueEth, // Internal: used by aggregator for conversion
  })) as any[];
}

export async function fetchNftActivity(
  config: BlurConfig
): Promise<TradeRecord[]> {
  const url = `${RESERVOIR_BASE}/users/activity/v6?users=${config.walletAddress}&limit=50&types=sale&types=mint&types=transfer`;

  const response = await fetch(url, {
    headers: buildHeaders(config.reservoirApiKey),
  });

  if (!response.ok) {
    throw new Error(`Reservoir API error: ${response.status}`);
  }

  const data = await response.json();
  const activities: any[] = data.activities ?? [];

  return activities.map((activity) => {
    const isBuy =
      activity.toAddress?.toLowerCase() ===
      config.walletAddress.toLowerCase();
    const priceEth = Number(activity.price?.amount?.decimal ?? 0);
    const priceUsd = Number(activity.price?.amount?.usd ?? 0);
    const collectionName =
      activity.collection?.collectionName ?? "Unknown NFT";
    const tokenName = activity.token?.tokenName ?? collectionName;

    let type: TradeRecord["type"] = "transfer";
    if (activity.type === "sale") {
      type = isBuy ? "buy" : "sell";
    } else if (activity.type === "mint") {
      type = "buy";
    }

    return {
      id: `blur-${activity.txHash ?? Date.now()}-${activity.logIndex ?? 0}`,
      date: activity.timestamp
        ? new Date(activity.timestamp * 1000).toISOString()
        : new Date().toISOString(),
      platform: "blur" as const,
      type,
      asset: tokenName,
      amount: Number(activity.amount ?? 1),
      priceUsd,
      totalValueUsd: priceUsd,
      feesUsd: 0,
      txHash: activity.txHash,
      source: "api" as const,
      notes: `Collection: ${collectionName}`,
      raw: activity,
    };
  });
}

export async function enrichBlurHoldingsWithEthPrice(
  holdings: any[],
  ethPriceUsd: number
): Promise<PortfolioHolding[]> {
  return holdings.map((h) => ({
    ...h,
    currentPriceUsd: (h._ethValue ?? 0) * ethPriceUsd / Math.max(h.amount, 1),
    currentValueUsd: (h._ethValue ?? 0) * ethPriceUsd,
  }));
}

export async function fetchBlurHoldings(
  config: BlurConfig
): Promise<PortfolioHolding[]> {
  return fetchNftHoldings(config);
}

export async function fetchBlurTrades(
  config: BlurConfig
): Promise<TradeRecord[]> {
  return fetchNftActivity(config);
}
