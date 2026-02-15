import { create } from "zustand";
import { ManualEntry } from "../types";

const STORAGE_KEY = "manual_entries";

interface ManualEntriesState {
  entries: ManualEntry[];
  hydrated: boolean;

  hydrate: () => Promise<void>;
  addEntry: (entry: ManualEntry) => Promise<void>;
  updateEntry: (id: string, updates: Partial<ManualEntry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
}

const persist = (entries: ManualEntry[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
};

export const useManualEntriesStore = create<ManualEntriesState>((set, get) => ({
  entries: [],
  hydrated: false,

  hydrate: async () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    const entries: ManualEntry[] = raw ? JSON.parse(raw) : [];
    set({ entries, hydrated: true });
  },

  addEntry: async (entry) => {
    const entries = [...get().entries, entry].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    set({ entries });
    persist(entries);
  },

  updateEntry: async (id, updates) => {
    const entries = get().entries.map((e) =>
      e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e
    );
    set({ entries });
    persist(entries);
  },

  deleteEntry: async (id) => {
    const entries = get().entries.filter((e) => e.id !== id);
    set({ entries });
    persist(entries);
  },
}));
