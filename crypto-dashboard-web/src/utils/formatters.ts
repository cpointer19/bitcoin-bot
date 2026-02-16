/**
 * Currency, date, and address formatting utilities.
 */

import { useSettingsStore } from "../stores/settings";

export type DisplayCurrency = "USD" | "CAD";

export function formatCurrency(
  valueUsd: number,
  currency: DisplayCurrency = "USD",
  cadRate: number = 1
): string {
  const value = currency === "CAD" ? valueUsd * cadRate : valueUsd;
  const symbol = currency === "CAD" ? "C$" : "$";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${symbol}${(value / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `${symbol}${value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (abs >= 1) {
    return `${symbol}${value.toFixed(2)}`;
  }
  if (abs >= 0.01) {
    return `${symbol}${value.toFixed(4)}`;
  }
  return `${symbol}${value.toFixed(6)}`;
}

/** @deprecated Use formatCurrency instead */
export function formatUsd(value: number): string {
  return formatCurrency(value, "USD", 1);
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatAmount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  if (value >= 1) {
    return value.toFixed(4);
  }
  return value.toFixed(6);
}

export function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * React hook: returns a formatter bound to the current currency setting.
 * Must be called from a React component.
 */
export function useFormatCurrency(): (valueUsd: number) => string {
  const currency = useSettingsStore((s) => s.currency);
  const cadRate = useSettingsStore((s) => s.cadRate);
  return (valueUsd: number) => formatCurrency(valueUsd, currency, cadRate);
}

export function formatAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function timeAgo(isoString: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(isoString).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
