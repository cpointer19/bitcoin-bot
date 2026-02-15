/**
 * Solana wallet service via Helius API (helius.dev).
 * Fetches SOL + SPL token balances and parsed transaction history.
 * Falls back to public Solana RPC if no Helius key is provided.
 */

import { TradeRecord, PortfolioHolding } from "../types";
import { fetchPrices, getCoingeckoId } from "./coingecko";

const HELIUS_BASE = "https://api.helius.xyz";
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";

interface SolanaConfig {
  walletAddress: string;
  heliusApiKey?: string;
}

function heliusUrl(path: string, apiKey: string): string {
  return `${HELIUS_BASE}${path}?api-key=${apiKey}`;
}

/**
 * Fetch balances via Helius enhanced API.
 */
async function fetchBalancesHelius(
  config: SolanaConfig & { heliusApiKey: string }
): Promise<PortfolioHolding[]> {
  const url = heliusUrl(
    `/v0/addresses/${config.walletAddress}/balances`,
    config.heliusApiKey
  );

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Helius API error: ${response.status}`);
  }

  const data = await response.json();
  const holdings: PortfolioHolding[] = [];

  // SOL native balance
  const solLamports = Number(data.nativeBalance ?? 0);
  const solAmount = solLamports / 1e9;

  // SPL tokens
  const tokens: any[] = data.tokens ?? [];

  // Collect symbols for price lookup
  const allSymbols = ["SOL"];
  const tokenBalances: { symbol: string; amount: number; mint: string }[] = [];

  for (const t of tokens) {
    const amount = Number(t.amount ?? 0) / Math.pow(10, t.decimals ?? 0);
    if (amount > 0) {
      // Use mint address as fallback symbol
      const symbol = t.symbol ?? t.mint?.slice(0, 6) ?? "UNKNOWN";
      allSymbols.push(symbol);
      tokenBalances.push({ symbol, amount, mint: t.mint });
    }
  }

  // Fetch prices
  const coinIds: string[] = [];
  const symbolToId: Record<string, string> = {};
  for (const sym of allSymbols) {
    const id = getCoingeckoId(sym);
    if (id) {
      coinIds.push(id);
      symbolToId[sym] = id;
    }
  }
  const prices = coinIds.length > 0 ? await fetchPrices(coinIds) : {};

  // Add SOL holding
  const solId = symbolToId["SOL"];
  const solPrice = solId ? prices[solId] : undefined;
  if (solAmount > 0) {
    holdings.push({
      asset: "SOL",
      platform: "solana",
      amount: solAmount,
      currentPriceUsd: solPrice?.usd ?? 0,
      currentValueUsd: solAmount * (solPrice?.usd ?? 0),
      change24hPercent: solPrice?.usd_24h_change ?? 0,
    });
  }

  // Add SPL token holdings
  for (const t of tokenBalances) {
    const id = symbolToId[t.symbol];
    const price = id ? prices[id] : undefined;

    holdings.push({
      asset: t.symbol,
      platform: "solana",
      amount: t.amount,
      currentPriceUsd: price?.usd ?? 0,
      currentValueUsd: t.amount * (price?.usd ?? 0),
      change24hPercent: price?.usd_24h_change ?? 0,
    });
  }

  return holdings;
}

/**
 * Fallback: fetch SOL balance via public RPC.
 */
async function fetchBalancesRpc(
  config: SolanaConfig
): Promise<PortfolioHolding[]> {
  const response = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [config.walletAddress],
    }),
  });

  if (!response.ok) {
    throw new Error(`Solana RPC error: ${response.status}`);
  }

  const data = await response.json();
  const lamports = data.result?.value ?? 0;
  const solAmount = lamports / 1e9;

  if (solAmount <= 0) return [];

  // Get SOL price
  const solId = getCoingeckoId("SOL");
  const prices = solId ? await fetchPrices([solId]) : {};
  const solPrice = solId ? prices[solId] : undefined;

  return [
    {
      asset: "SOL",
      platform: "solana",
      amount: solAmount,
      currentPriceUsd: solPrice?.usd ?? 0,
      currentValueUsd: solAmount * (solPrice?.usd ?? 0),
      change24hPercent: solPrice?.usd_24h_change ?? 0,
    },
  ];
}

/**
 * Fetch parsed transaction history via Helius enhanced API.
 */
async function fetchTransactionsHelius(
  config: SolanaConfig & { heliusApiKey: string }
): Promise<TradeRecord[]> {
  const url = heliusUrl(
    `/v0/addresses/${config.walletAddress}/transactions`,
    config.heliusApiKey
  );

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Helius API error: ${response.status}`);
  }

  const txs: any[] = await response.json();

  return txs.map((tx) => {
    // Helius provides human-readable tx types
    let type: TradeRecord["type"] = "other";
    const txType = (tx.type ?? "").toUpperCase();
    if (txType === "SWAP") type = "swap";
    else if (txType === "TRANSFER") type = "transfer";
    else if (txType.includes("NFT_SALE")) type = "sell";
    else if (txType.includes("NFT_BUY") || txType.includes("NFT_MINT"))
      type = "buy";

    // Extract primary token transfer
    const nativeTransfers: any[] = tx.nativeTransfers ?? [];
    const tokenTransfers: any[] = tx.tokenTransfers ?? [];

    let asset = "SOL";
    let amount = 0;

    if (tokenTransfers.length > 0) {
      const main = tokenTransfers[0];
      asset = main.tokenStandard ?? main.mint?.slice(0, 6) ?? "Token";
      amount = Number(main.tokenAmount ?? 0);
    } else if (nativeTransfers.length > 0) {
      const main = nativeTransfers[0];
      amount = Number(main.amount ?? 0) / 1e9;
    }

    return {
      id: `sol-${tx.signature}`,
      date: tx.timestamp
        ? new Date(tx.timestamp * 1000).toISOString()
        : new Date().toISOString(),
      platform: "solana" as const,
      type,
      asset,
      amount,
      priceUsd: 0,
      totalValueUsd: 0,
      feesUsd: Number(tx.fee ?? 0) / 1e9,
      txHash: tx.signature,
      source: "api" as const,
      notes: tx.description ?? undefined,
      raw: tx,
    };
  });
}

export async function fetchSolanaHoldings(
  config: SolanaConfig
): Promise<PortfolioHolding[]> {
  if (config.heliusApiKey) {
    return fetchBalancesHelius({
      ...config,
      heliusApiKey: config.heliusApiKey,
    });
  }
  return fetchBalancesRpc(config);
}

export async function fetchSolanaTrades(
  config: SolanaConfig
): Promise<TradeRecord[]> {
  if (!config.heliusApiKey) {
    // No transaction history available without Helius
    return [];
  }
  return fetchTransactionsHelius({
    ...config,
    heliusApiKey: config.heliusApiKey,
  });
}
