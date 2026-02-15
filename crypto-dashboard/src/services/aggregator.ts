/**
 * Aggregator service: normalizes data from all platform services into
 * unified PortfolioHolding[] and TradeRecord[] types.
 *
 * All 5 platforms wired in. If one fails, others still show.
 */

import { PortfolioHolding, TradeRecord, Platform } from "../types";
import { useSettingsStore } from "../stores/settings";
import { fetchEthereumHoldings, fetchEthTransactions } from "./ethereum";
import {
  fetchCryptoComHoldings,
  fetchCryptoComTrades,
} from "./crypto-com";
import {
  fetchHyperliquidHoldings,
  fetchHyperliquidTrades,
} from "./hyperliquid";
import {
  fetchBlurHoldings,
  fetchBlurTrades,
  enrichBlurHoldingsWithEthPrice,
} from "./blur";
import { fetchSolanaHoldings, fetchSolanaTrades } from "./solana";
import { fetchPrices } from "./coingecko";

interface AggregatorResult {
  holdings: PortfolioHolding[];
  trades: TradeRecord[];
  errors: { platform: Platform; error: string }[];
}

async function fetchPlatformData(
  platform: Platform,
  getCredential: (platform: Platform, key: string) => Promise<string | null>
): Promise<{ holdings: PortfolioHolding[]; trades: TradeRecord[] }> {
  switch (platform) {
    case "crypto.com": {
      const apiKey = await getCredential("crypto.com", "apiKey");
      const apiSecret = await getCredential("crypto.com", "apiSecret");
      if (!apiKey || !apiSecret) return { holdings: [], trades: [] };
      const config = { apiKey, apiSecret };
      const [holdings, trades] = await Promise.all([
        fetchCryptoComHoldings(config),
        fetchCryptoComTrades(config),
      ]);
      return { holdings, trades };
    }

    case "hyperliquid": {
      const walletAddress = await getCredential("hyperliquid", "walletAddress");
      if (!walletAddress) return { holdings: [], trades: [] };
      const config = { walletAddress };
      const [holdings, trades] = await Promise.all([
        fetchHyperliquidHoldings(config),
        fetchHyperliquidTrades(config),
      ]);
      return { holdings, trades };
    }

    case "blur": {
      const walletAddress = await getCredential("blur", "walletAddress");
      if (!walletAddress) return { holdings: [], trades: [] };
      const reservoirApiKey =
        (await getCredential("blur", "reservoirApiKey")) ?? undefined;
      const config = { walletAddress, reservoirApiKey };
      const [rawHoldings, trades] = await Promise.all([
        fetchBlurHoldings(config),
        fetchBlurTrades(config),
      ]);
      // Enrich NFT holdings with ETH price for USD conversion
      const ethPrices = await fetchPrices(["ethereum"]);
      const ethPriceUsd = ethPrices["ethereum"]?.usd ?? 0;
      const holdings = await enrichBlurHoldingsWithEthPrice(
        rawHoldings,
        ethPriceUsd
      );
      return { holdings, trades };
    }

    case "ethereum": {
      const walletAddress = await getCredential("ethereum", "walletAddress");
      if (!walletAddress) return { holdings: [], trades: [] };
      const apiKey =
        (await getCredential("ethereum", "etherscanApiKey")) ?? undefined;
      const config = { walletAddress, apiKey };
      const [holdings, trades] = await Promise.all([
        fetchEthereumHoldings(config),
        fetchEthTransactions(config),
      ]);
      return { holdings, trades };
    }

    case "solana": {
      const walletAddress = await getCredential("solana", "walletAddress");
      if (!walletAddress) return { holdings: [], trades: [] };
      const heliusApiKey =
        (await getCredential("solana", "heliusApiKey")) ?? undefined;
      const config = { walletAddress, heliusApiKey };
      const [holdings, trades] = await Promise.all([
        fetchSolanaHoldings(config),
        fetchSolanaTrades(config),
      ]);
      return { holdings, trades };
    }

    default:
      return { holdings: [], trades: [] };
  }
}

export async function fetchAllPlatformData(): Promise<AggregatorResult> {
  const { getCredential, setConnectionStatus } = useSettingsStore.getState();

  const platforms: Platform[] = [
    "crypto.com",
    "hyperliquid",
    "blur",
    "ethereum",
    "solana",
  ];

  const allHoldings: PortfolioHolding[] = [];
  const allTrades: TradeRecord[] = [];
  const errors: { platform: Platform; error: string }[] = [];

  // Fetch all platforms in parallel, catching per-platform errors
  const results = await Promise.allSettled(
    platforms.map(async (platform) => {
      const data = await fetchPlatformData(platform, getCredential);
      return { platform, ...data };
    })
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const platform = platforms[i];

    if (result.status === "fulfilled") {
      const { holdings, trades } = result.value;
      allHoldings.push(...holdings);
      allTrades.push(...trades);
      if (holdings.length > 0 || trades.length > 0) {
        setConnectionStatus(platform, "connected");
      }
    } else {
      errors.push({
        platform,
        error: result.reason?.message ?? "Unknown error",
      });
      setConnectionStatus(platform, "error");
    }
  }

  // Sort trades by date descending
  allTrades.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return { holdings: allHoldings, trades: allTrades, errors };
}
