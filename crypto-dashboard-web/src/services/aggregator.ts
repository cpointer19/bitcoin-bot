/**
 * Aggregator service: normalizes data from all platform services into
 * unified PortfolioHolding[] and TradeRecord[] types.
 *
 * Supports multiple wallet addresses per platform (newline-separated).
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
import { fetchBitcoinHoldings } from "./bitcoin";
import { fetchPrices } from "./coingecko";

interface AggregatorResult {
  holdings: PortfolioHolding[];
  trades: TradeRecord[];
  errors: { platform: Platform; error: string }[];
}

/** Split a newline-separated address string into trimmed, non-empty addresses */
function parseAddresses(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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
      const config = { walletAddress: walletAddress.trim() };
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
      const config = { walletAddress: walletAddress.trim(), reservoirApiKey };
      const [rawHoldings, trades] = await Promise.all([
        fetchBlurHoldings(config),
        fetchBlurTrades(config),
      ]);
      const ethPrices = await fetchPrices(["ethereum"]);
      const ethPriceUsd = ethPrices["ethereum"]?.usd ?? 0;
      const holdings = await enrichBlurHoldingsWithEthPrice(
        rawHoldings,
        ethPriceUsd
      );
      return { holdings, trades };
    }

    case "ethereum": {
      const raw = await getCredential("ethereum", "walletAddress");
      const addresses = parseAddresses(raw);
      if (addresses.length === 0) return { holdings: [], trades: [] };
      const apiKey =
        (await getCredential("ethereum", "etherscanApiKey")) ?? undefined;

      const allHoldings: PortfolioHolding[] = [];
      const allTrades: TradeRecord[] = [];

      // Fetch each address (sequentially to avoid rate limits)
      for (const addr of addresses) {
        const config = { walletAddress: addr, apiKey };
        const [holdings, trades] = await Promise.all([
          fetchEthereumHoldings(config).catch(() => []),
          fetchEthTransactions(config).catch(() => []),
        ]);
        allHoldings.push(...holdings);
        allTrades.push(...trades);
      }

      return { holdings: allHoldings, trades: allTrades };
    }

    case "bitcoin": {
      const raw = await getCredential("bitcoin", "walletAddress");
      const addresses = parseAddresses(raw);
      if (addresses.length === 0) return { holdings: [], trades: [] };
      const holdings = await fetchBitcoinHoldings(addresses);
      return { holdings, trades: [] };
    }

    case "solana": {
      const raw = await getCredential("solana", "walletAddress");
      const addresses = parseAddresses(raw);
      if (addresses.length === 0) return { holdings: [], trades: [] };
      const heliusApiKey =
        (await getCredential("solana", "heliusApiKey")) ?? undefined;

      const allHoldings: PortfolioHolding[] = [];
      const allTrades: TradeRecord[] = [];

      for (const addr of addresses) {
        const config = { walletAddress: addr, heliusApiKey };
        const [holdings, trades] = await Promise.all([
          fetchSolanaHoldings(config).catch(() => []),
          fetchSolanaTrades(config).catch(() => []),
        ]);
        allHoldings.push(...holdings);
        allTrades.push(...trades);
      }

      return { holdings: allHoldings, trades: allTrades };
    }

    default:
      return { holdings: [], trades: [] };
  }
}

export async function fetchAllPlatformData(): Promise<AggregatorResult> {
  const { getCredential, setConnectionStatus } = useSettingsStore.getState();

  const platforms: Platform[] = [
    "ethereum",
    "bitcoin",
    "solana",
    "crypto.com",
    "hyperliquid",
    "blur",
  ];

  const allHoldings: PortfolioHolding[] = [];
  const allTrades: TradeRecord[] = [];
  const errors: { platform: Platform; error: string }[] = [];

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

  allTrades.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return { holdings: allHoldings, trades: allTrades, errors };
}
