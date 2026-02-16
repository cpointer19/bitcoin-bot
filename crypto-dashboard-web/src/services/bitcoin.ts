/**
 * Bitcoin wallet service via Blockstream API.
 * Fetches BTC balance for one or more addresses.
 * Free, no API key needed.
 */

import { PortfolioHolding } from "../types";
import { fetchPrices } from "./coingecko";

const BLOCKSTREAM_BASE = "https://blockstream.info/api";

export async function fetchBtcBalance(address: string): Promise<number> {
  const response = await fetch(`${BLOCKSTREAM_BASE}/address/${address}`);
  if (!response.ok) {
    throw new Error(`Blockstream API error: ${response.status}`);
  }
  const data = await response.json();
  const funded = data.chain_stats?.funded_txo_sum ?? 0;
  const spent = data.chain_stats?.spent_txo_sum ?? 0;
  return (funded - spent) / 1e8;
}

export async function fetchBitcoinHoldings(
  addresses: string[]
): Promise<PortfolioHolding[]> {
  if (addresses.length === 0) return [];

  const balances = await Promise.all(
    addresses.map(async (addr) => {
      try {
        return await fetchBtcBalance(addr);
      } catch {
        return 0;
      }
    })
  );

  const totalBtc = balances.reduce((sum, b) => sum + b, 0);
  if (totalBtc <= 0) return [];

  const prices = await fetchPrices(["bitcoin"]);
  const btcPrice = prices["bitcoin"];

  return [
    {
      asset: "BTC",
      platform: "bitcoin",
      amount: totalBtc,
      currentPriceUsd: btcPrice?.usd ?? 0,
      currentValueUsd: totalBtc * (btcPrice?.usd ?? 0),
      change24hPercent: btcPrice?.usd_24h_change ?? 0,
    },
  ];
}
