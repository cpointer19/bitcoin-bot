import { create } from "zustand";
import { TradeRecord } from "../types";

interface TradesState {
  trades: TradeRecord[];
  loading: boolean;
  error: string | null;

  setTrades: (trades: TradeRecord[]) => void;
  addTrades: (trades: TradeRecord[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useTradesStore = create<TradesState>((set) => ({
  trades: [],
  loading: false,
  error: null,

  setTrades: (trades) => set({ trades }),

  addTrades: (newTrades) =>
    set((state) => ({
      trades: [...state.trades, ...newTrades].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    })),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
