/**
 * Crypto.com Exchange API service.
 * Base URL: https://api.crypto.com/exchange/v1
 * Auth: HMAC-SHA256 signed requests (API key + secret).
 * Rate limits: 3 requests/100ms per method.
 */

import { TradeRecord, PortfolioHolding } from "../types";
import { fetchPrices, getCoingeckoId } from "./coingecko";

const BASE_URL = "https://api.crypto.com/exchange/v1";

interface CryptoComConfig {
  apiKey: string;
  apiSecret: string;
}

/**
 * HMAC-SHA256 signing for Crypto.com Exchange API.
 * Uses the Web Crypto API available in React Native.
 */
async function hmacSign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signedRequest(
  method: string,
  config: CryptoComConfig,
  params: Record<string, any> = {}
): Promise<any> {
  const id = Date.now();
  const nonce = Date.now();

  const requestBody: any = {
    id,
    method,
    api_key: config.apiKey,
    params,
    nonce,
  };

  // Build the signature string: method + id + api_key + sorted params + nonce
  const paramString = Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("");

  const sigPayload = `${method}${id}${config.apiKey}${paramString}${nonce}`;
  requestBody.sig = await hmacSign(sigPayload, config.apiSecret);

  const response = await fetch(`${BASE_URL}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`Crypto.com API HTTP error: ${response.status}`);
  }

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`Crypto.com API error: ${data.code} - ${data.message}`);
  }

  return data.result;
}

export async function fetchAccountSummary(
  config: CryptoComConfig
): Promise<PortfolioHolding[]> {
  const result = await signedRequest("private/get-account-summary", config);
  const accounts: any[] = result?.accounts ?? [];

  // Collect all symbols that have balances
  const balances = accounts.filter(
    (a) => Number(a.available) + Number(a.order) > 0
  );

  if (balances.length === 0) return [];

  // Fetch prices from CoinGecko
  const coinIds: string[] = [];
  const symbolToId: Record<string, string> = {};
  for (const bal of balances) {
    const id = getCoingeckoId(bal.currency);
    if (id) {
      coinIds.push(id);
      symbolToId[bal.currency] = id;
    }
  }

  const prices = coinIds.length > 0 ? await fetchPrices(coinIds) : {};

  return balances.map((bal) => {
    const amount = Number(bal.available) + Number(bal.order) + Number(bal.stake);
    const id = symbolToId[bal.currency];
    const price = id ? prices[id] : undefined;

    return {
      asset: bal.currency,
      platform: "crypto.com" as const,
      amount,
      currentPriceUsd: price?.usd ?? 0,
      currentValueUsd: amount * (price?.usd ?? 0),
      change24hPercent: price?.usd_24h_change ?? 0,
    };
  });
}

export async function fetchOrderHistory(
  config: CryptoComConfig
): Promise<TradeRecord[]> {
  const result = await signedRequest("private/get-order-history", config, {
    page_size: 50,
  });

  const orders: any[] = result?.order_list ?? [];

  return orders
    .filter((o) => o.status === "FILLED")
    .map((o) => {
      const isBuy = o.side === "BUY";
      const asset = o.instrument_name?.split("_")[0] ?? "UNKNOWN";
      const amount = Number(o.cumulative_quantity) || 0;
      const totalValue = Number(o.cumulative_value) || 0;
      const price = amount > 0 ? totalValue / amount : 0;
      const fees = Number(o.fee_currency_amount) || 0;

      return {
        id: `cdc-${o.order_id}`,
        date: new Date(Number(o.create_time)).toISOString(),
        platform: "crypto.com" as const,
        type: isBuy ? ("buy" as const) : ("sell" as const),
        asset,
        amount,
        priceUsd: price,
        totalValueUsd: totalValue,
        feesUsd: fees,
        txHash: o.order_id,
        source: "api" as const,
        raw: o,
      };
    });
}

export async function fetchDepositWithdrawals(
  config: CryptoComConfig
): Promise<TradeRecord[]> {
  const [deposits, withdrawals] = await Promise.all([
    signedRequest("private/get-deposit-list", config, { page_size: 50 }).catch(
      () => ({ deposit_list: [] })
    ),
    signedRequest("private/get-withdrawal-list", config, {
      page_size: 50,
    }).catch(() => ({ withdrawal_list: [] })),
  ]);

  const records: TradeRecord[] = [];

  for (const d of deposits?.deposit_list ?? []) {
    records.push({
      id: `cdc-dep-${d.id}`,
      date: new Date(Number(d.create_time)).toISOString(),
      platform: "crypto.com",
      type: "transfer",
      asset: d.currency,
      amount: Number(d.amount) || 0,
      priceUsd: 0,
      totalValueUsd: 0,
      feesUsd: Number(d.fee) || 0,
      txHash: d.txid,
      source: "api",
      notes: "Deposit",
      raw: d,
    });
  }

  for (const w of withdrawals?.withdrawal_list ?? []) {
    records.push({
      id: `cdc-wd-${w.id}`,
      date: new Date(Number(w.create_time)).toISOString(),
      platform: "crypto.com",
      type: "transfer",
      asset: w.currency,
      amount: Number(w.amount) || 0,
      priceUsd: 0,
      totalValueUsd: 0,
      feesUsd: Number(w.fee) || 0,
      txHash: w.txid,
      source: "api",
      notes: "Withdrawal",
      raw: w,
    });
  }

  return records;
}

export async function fetchCryptoComHoldings(
  config: CryptoComConfig
): Promise<PortfolioHolding[]> {
  return fetchAccountSummary(config);
}

export async function fetchCryptoComTrades(
  config: CryptoComConfig
): Promise<TradeRecord[]> {
  const [orders, transfers] = await Promise.all([
    fetchOrderHistory(config),
    fetchDepositWithdrawals(config),
  ]);
  return [...orders, ...transfers].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}
