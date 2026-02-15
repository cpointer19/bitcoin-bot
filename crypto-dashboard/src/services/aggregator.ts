/**
 * Aggregator service: normalizes data from all platform services into
 * unified PortfolioHolding[] and TradeRecord[] types.
 *
 * Phase 2: Only Ethereum is implemented. Others return empty arrays.
 * Phase 3 will add Crypto.com, Hyperliquid, Blur, and Solana.
 */

import { PortfolioHolding, TradeRecord, Platform } from "../types";
import { useSettingsStore } from "../stores/settings";
import { fetchEthereumHoldings, fetchEthTransactions } from "./ethereum";

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

    // Phase 3 stubs
    case "crypto.com":
    case "hyperliquid":
    case "blur":
    case "solana":
      return { holdings: [], trades: [] };

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

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { platform, holdings, trades } = result.value;
      allHoldings.push(...holdings);
      allTrades.push(...trades);
      if (holdings.length > 0 || trades.length > 0) {
        setConnectionStatus(platform, "connected");
      }
    } else {
      const platform = platforms[results.indexOf(result)];
      errors.push({ platform, error: result.reason?.message ?? "Unknown error" });
      setConnectionStatus(platform, "error");
    }
  }

  // Sort trades by date descending
  allTrades.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return { holdings: allHoldings, trades: allTrades, errors };
}
