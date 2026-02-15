import { create } from "zustand";
import { Platform, ConnectionStatus } from "../types";

interface PlatformCredentials {
  [key: string]: string;
}

interface SettingsState {
  credentials: Record<Platform, PlatformCredentials>;
  connectionStatus: Record<Platform, ConnectionStatus>;
  currency: "USD" | "CAD";
  autoRefreshInterval: 5 | 15 | 30 | 0;
  hydrated: boolean;

  setCredential: (platform: Platform, key: string, value: string) => Promise<void>;
  getCredential: (platform: Platform, key: string) => Promise<string | null>;
  setConnectionStatus: (platform: Platform, status: ConnectionStatus) => void;
  setCurrency: (currency: "USD" | "CAD") => void;
  setAutoRefreshInterval: (interval: 5 | 15 | 30 | 0) => void;
  hydrate: () => Promise<void>;
  clearAll: () => Promise<void>;
}

const storageKey = (platform: Platform, key: string) => `cred_${platform}_${key}`;

const PLATFORMS: Platform[] = ["crypto.com", "hyperliquid", "blur", "ethereum", "solana"];

export const useSettingsStore = create<SettingsState>((set, get) => ({
  credentials: {
    "crypto.com": {},
    hyperliquid: {},
    blur: {},
    ethereum: {},
    solana: {},
    other: {},
  },
  connectionStatus: {
    "crypto.com": "unconfigured",
    hyperliquid: "unconfigured",
    blur: "unconfigured",
    ethereum: "unconfigured",
    solana: "unconfigured",
    other: "unconfigured",
  },
  currency: "CAD",
  autoRefreshInterval: 15,
  hydrated: false,

  setCredential: async (platform, key, value) => {
    const sk = storageKey(platform, key);
    if (value) {
      localStorage.setItem(sk, value);
    } else {
      localStorage.removeItem(sk);
    }
    set((state) => ({
      credentials: {
        ...state.credentials,
        [platform]: {
          ...state.credentials[platform],
          [key]: value ? "configured" : "",
        },
      },
    }));
  },

  getCredential: async (platform, key) => {
    return localStorage.getItem(storageKey(platform, key));
  },

  setConnectionStatus: (platform, status) =>
    set((state) => ({
      connectionStatus: { ...state.connectionStatus, [platform]: status },
    })),

  setCurrency: (currency) => {
    set({ currency });
    localStorage.setItem("settings_currency", currency);
  },

  setAutoRefreshInterval: (interval) => {
    set({ autoRefreshInterval: interval });
    localStorage.setItem("settings_autoRefresh", String(interval));
  },

  hydrate: async () => {
    const currency = (localStorage.getItem("settings_currency") as "USD" | "CAD") ?? "CAD";
    const autoRefreshRaw = localStorage.getItem("settings_autoRefresh");
    const autoRefreshInterval = autoRefreshRaw ? (Number(autoRefreshRaw) as 5 | 15 | 30 | 0) : 15;

    const connectionStatus: Record<Platform, ConnectionStatus> = {
      "crypto.com": "unconfigured",
      hyperliquid: "unconfigured",
      blur: "unconfigured",
      ethereum: "unconfigured",
      solana: "unconfigured",
      other: "unconfigured",
    };

    for (const p of PLATFORMS) {
      const hasWallet = localStorage.getItem(storageKey(p, "walletAddress"));
      const hasApiKey = localStorage.getItem(storageKey(p, "apiKey"));
      if (hasWallet || hasApiKey) {
        connectionStatus[p] = "connected";
      }
    }

    set({ currency, autoRefreshInterval, connectionStatus, hydrated: true });
  },

  clearAll: async () => {
    for (const p of PLATFORMS) {
      for (const key of ["apiKey", "apiSecret", "walletAddress", "heliusApiKey", "etherscanApiKey"]) {
        localStorage.removeItem(storageKey(p, key));
      }
    }
    localStorage.removeItem("settings_currency");
    localStorage.removeItem("settings_autoRefresh");
    set({
      credentials: {
        "crypto.com": {},
        hyperliquid: {},
        blur: {},
        ethereum: {},
        solana: {},
        other: {},
      },
      connectionStatus: {
        "crypto.com": "unconfigured",
        hyperliquid: "unconfigured",
        blur: "unconfigured",
        ethereum: "unconfigured",
        solana: "unconfigured",
        other: "unconfigured",
      },
      currency: "CAD",
      autoRefreshInterval: 15,
    });
  },
}));
