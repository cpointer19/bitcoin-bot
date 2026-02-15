/**
 * CoinGecko free API service for spot prices.
 * Free tier: 30 calls/min, no key needed.
 */

const BASE_URL = "https://api.coingecko.com/api/v3";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedPrice {
  prices: Record<string, { usd: number; usd_24h_change: number }>;
  timestamp: number;
}

let priceCache: CachedPrice | null = null;

// Map common asset symbols to CoinGecko IDs
const SYMBOL_TO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  USDT: "tether",
  USDC: "usd-coin",
  DAI: "dai",
  MATIC: "matic-network",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  LINK: "chainlink",
  UNI: "uniswap",
  AAVE: "aave",
  CRO: "crypto-com-chain",
  BLUR: "blur",
  ARB: "arbitrum",
  OP: "optimism",
  DOGE: "dogecoin",
  SHIB: "shiba-inu",
  ADA: "cardano",
  XRP: "ripple",
  ATOM: "cosmos",
};

export function getCoingeckoId(symbol: string): string | undefined {
  return SYMBOL_TO_ID[symbol.toUpperCase()];
}

export async function fetchPrices(
  coinIds: string[]
): Promise<Record<string, { usd: number; usd_24h_change: number }>> {
  // Check cache
  if (priceCache && Date.now() - priceCache.timestamp < CACHE_TTL_MS) {
    const allCached = coinIds.every((id) => id in priceCache!.prices);
    if (allCached) return priceCache.prices;
  }

  const ids = coinIds.join(",");
  const url = `${BASE_URL}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CoinGecko API error: ${response.status}`);
  }

  const data = await response.json();

  // Normalize response
  const prices: Record<string, { usd: number; usd_24h_change: number }> = {};
  for (const [id, values] of Object.entries(data)) {
    const v = values as any;
    prices[id] = {
      usd: v.usd ?? 0,
      usd_24h_change: v.usd_24h_change ?? 0,
    };
  }

  // Update cache
  priceCache = {
    prices: { ...(priceCache?.prices ?? {}), ...prices },
    timestamp: Date.now(),
  };

  return prices;
}

export async function fetchPriceBySymbol(
  symbol: string
): Promise<{ usd: number; usd_24h_change: number } | null> {
  const id = getCoingeckoId(symbol);
  if (!id) return null;
  const prices = await fetchPrices([id]);
  return prices[id] ?? null;
}

export async function fetchMultiplePricesBySymbol(
  symbols: string[]
): Promise<Record<string, { usd: number; usd_24h_change: number }>> {
  const idMap: Record<string, string> = {}; // coingecko id -> original symbol
  const ids: string[] = [];

  for (const symbol of symbols) {
    const id = getCoingeckoId(symbol);
    if (id) {
      idMap[id] = symbol;
      ids.push(id);
    }
  }

  if (ids.length === 0) return {};

  const prices = await fetchPrices(ids);
  const result: Record<string, { usd: number; usd_24h_change: number }> = {};

  for (const [id, price] of Object.entries(prices)) {
    const symbol = idMap[id];
    if (symbol) {
      result[symbol] = price;
    }
  }

  return result;
}

export function clearPriceCache() {
  priceCache = null;
}
