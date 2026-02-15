import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

const persist = async (entries: ManualEntry[]) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
};

export const useManualEntriesStore = create<ManualEntriesState>((set, get) => ({
  entries: [],
  hydrated: false,

  hydrate: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const entries: ManualEntry[] = raw ? JSON.parse(raw) : [];
    set({ entries, hydrated: true });
  },

  addEntry: async (entry) => {
    const entries = [...get().entries, entry].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    set({ entries });
    await persist(entries);
  },

  updateEntry: async (id, updates) => {
    const entries = get().entries.map((e) =>
      e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e
    );
    set({ entries });
    await persist(entries);
  },

  deleteEntry: async (id) => {
    const entries = get().entries.filter((e) => e.id !== id);
    set({ entries });
    await persist(entries);
  },
}));
