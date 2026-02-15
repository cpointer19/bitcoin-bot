import { create } from "zustand";
import { PortfolioHolding } from "../types";

interface PortfolioState {
  holdings: PortfolioHolding[];
  totalValueUsd: number;
  change24hUsd: number;
  change24hPercent: number;
  lastRefreshed: string | null;
  loading: boolean;
  error: string | null;

  setHoldings: (holdings: PortfolioHolding[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const usePortfolioStore = create<PortfolioState>((set) => ({
  holdings: [],
  totalValueUsd: 0,
  change24hUsd: 0,
  change24hPercent: 0,
  lastRefreshed: null,
  loading: false,
  error: null,

  setHoldings: (holdings) => {
    const totalValueUsd = holdings.reduce((sum, h) => sum + h.currentValueUsd, 0);
    const prevTotal = holdings.reduce(
      (sum, h) => sum + h.currentValueUsd / (1 + h.change24hPercent / 100),
      0
    );
    const change24hUsd = totalValueUsd - prevTotal;
    const change24hPercent = prevTotal > 0 ? (change24hUsd / prevTotal) * 100 : 0;

    set({
      holdings,
      totalValueUsd,
      change24hUsd,
      change24hPercent,
      lastRefreshed: new Date().toISOString(),
    });
  },

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
