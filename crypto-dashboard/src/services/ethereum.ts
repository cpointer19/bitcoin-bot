/**
 * Ethereum wallet service via Etherscan API.
 * Fetches ETH balance, ERC-20 token balances, and transaction history.
 */

import { TradeRecord, PortfolioHolding } from "../types";
import { fetchPrices, getCoingeckoId } from "./coingecko";

const ETHERSCAN_BASE = "https://api.etherscan.io/api";

// Well-known ERC-20 token addresses -> symbol mapping
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0xdac17f958d2ee523a2206206994597c13d831ec7": { symbol: "USDT", decimals: 18 },
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", decimals: 6 },
  "0x6b175474e89094c44da98b954eedeac495271d0f": { symbol: "DAI", decimals: 18 },
  "0x514910771af9ca656af840dff83e8264ecf986ca": { symbol: "LINK", decimals: 18 },
  "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": { symbol: "UNI", decimals: 18 },
  "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9": { symbol: "AAVE", decimals: 18 },
  "0x5a98fcbea516cf06857215779fd812ca3bef1b32": { symbol: "LDO", decimals: 18 },
};

interface EtherscanConfig {
  walletAddress: string;
  apiKey?: string;
}

function buildUrl(params: Record<string, string>, apiKey?: string): string {
  const searchParams = new URLSearchParams(params);
  if (apiKey) searchParams.set("apikey", apiKey);
  return `${ETHERSCAN_BASE}?${searchParams.toString()}`;
}

export async function fetchEthBalance(
  config: EtherscanConfig
): Promise<number> {
  const url = buildUrl(
    {
      module: "account",
      action: "balance",
      address: config.walletAddress,
      tag: "latest",
    },
    config.apiKey
  );

  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== "1") {
    throw new Error(`Etherscan error: ${data.message}`);
  }

  // Convert from Wei to ETH
  return Number(data.result) / 1e18;
}

export async function fetchErc20Transfers(
  config: EtherscanConfig
): Promise<
  { token: string; symbol: string; amount: number; contractAddress: string }[]
> {
  const url = buildUrl(
    {
      module: "account",
      action: "tokentx",
      address: config.walletAddress,
      startblock: "0",
      endblock: "99999999",
      sort: "desc",
      page: "1",
      offset: "100",
    },
    config.apiKey
  );

  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== "1" || !Array.isArray(data.result)) {
    return [];
  }

  // Aggregate token balances from transfers
  const balances: Record<
    string,
    { symbol: string; amount: number; contractAddress: string; decimals: number }
  > = {};

  for (const tx of data.result) {
    const addr = tx.contractAddress.toLowerCase();
    const symbol = tx.tokenSymbol || KNOWN_TOKENS[addr]?.symbol || "UNKNOWN";
    const decimals = Number(tx.tokenDecimal) || 18;
    const value = Number(tx.value) / Math.pow(10, decimals);

    if (!balances[addr]) {
      balances[addr] = { symbol, amount: 0, contractAddress: addr, decimals };
    }

    const isIncoming =
      tx.to.toLowerCase() === config.walletAddress.toLowerCase();
    balances[addr].amount += isIncoming ? value : -value;
  }

  return Object.values(balances)
    .filter((b) => b.amount > 0.001) // Filter dust
    .map((b) => ({
      token: b.symbol,
      symbol: b.symbol,
      amount: b.amount,
      contractAddress: b.contractAddress,
    }));
}

export async function fetchEthTransactions(
  config: EtherscanConfig
): Promise<TradeRecord[]> {
  const url = buildUrl(
    {
      module: "account",
      action: "txlist",
      address: config.walletAddress,
      startblock: "0",
      endblock: "99999999",
      sort: "desc",
      page: "1",
      offset: "50",
    },
    config.apiKey
  );

  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== "1" || !Array.isArray(data.result)) {
    return [];
  }

  return data.result.map((tx: any) => {
    const isIncoming =
      tx.to.toLowerCase() === config.walletAddress.toLowerCase();
    const valueEth = Number(tx.value) / 1e18;
    const gasUsed = (Number(tx.gasUsed) * Number(tx.gasPrice)) / 1e18;

    return {
      id: `eth-${tx.hash}`,
      date: new Date(Number(tx.timeStamp) * 1000).toISOString(),
      platform: "ethereum" as const,
      type: isIncoming ? ("transfer" as const) : ("transfer" as const),
      asset: "ETH",
      amount: valueEth,
      priceUsd: 0, // Will be enriched by aggregator
      totalValueUsd: 0,
      feesUsd: 0,
      txHash: tx.hash,
      source: "api" as const,
      raw: tx,
    };
  });
}

export async function fetchEthereumHoldings(
  config: EtherscanConfig
): Promise<PortfolioHolding[]> {
  const holdings: PortfolioHolding[] = [];

  // Fetch ETH balance
  const ethBalance = await fetchEthBalance(config);

  // Fetch ERC-20 token balances
  const tokens = await fetchErc20Transfers(config);

  // Collect all symbols we need prices for
  const symbols = ["ETH", ...tokens.map((t) => t.symbol)];
  const coinIds: string[] = [];
  const symbolToId: Record<string, string> = {};

  for (const sym of symbols) {
    const id = getCoingeckoId(sym);
    if (id) {
      coinIds.push(id);
      symbolToId[sym] = id;
    }
  }

  // Fetch all prices in one call
  const prices = coinIds.length > 0 ? await fetchPrices(coinIds) : {};

  // Add ETH holding
  const ethId = symbolToId["ETH"];
  const ethPrice = ethId ? prices[ethId] : undefined;
  if (ethBalance > 0) {
    holdings.push({
      asset: "ETH",
      platform: "ethereum",
      amount: ethBalance,
      currentPriceUsd: ethPrice?.usd ?? 0,
      currentValueUsd: ethBalance * (ethPrice?.usd ?? 0),
      change24hPercent: ethPrice?.usd_24h_change ?? 0,
    });
  }

  // Add token holdings
  for (const token of tokens) {
    const id = symbolToId[token.symbol];
    const price = id ? prices[id] : undefined;

    holdings.push({
      asset: token.symbol,
      platform: "ethereum",
      amount: token.amount,
      currentPriceUsd: price?.usd ?? 0,
      currentValueUsd: token.amount * (price?.usd ?? 0),
      change24hPercent: price?.usd_24h_change ?? 0,
    });
  }

  return holdings;
}
