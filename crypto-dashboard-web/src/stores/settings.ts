import { create } from "zustand";
import { Platform, ConnectionStatus } from "../types";

interface PlatformCredentials {
  [key: string]: string;
}

/** Pre-populated wallet addresses for first-time setup */
const DEFAULT_WALLETS: Record<string, string> = {
  "cred_ethereum_walletAddress": [
    "0x4D55b832B28a4EaF88Aa62A4212689A424DdaB73",
    "0xC4343E407821ce67d99e854820e285Df970CfDaf",
    "0x969231B91676CdC4a59Fc7009e582DdF6d1515Ce",
  ].join("\n"),
  "cred_bitcoin_walletAddress": "3PEnMX5JXq6k7YBoFgpKhq4HAzttWdsuY3",
  "cred_solana_walletAddress": [
    "12pmC723G4VJfuMTDq2TwshBv7dhFUTbwUG5LEGjqauY",
    "3x6LFNK5j2pfRn1Ma1eWugiVqoPajZHotrq3tY375HvN",
    "C6kHPAWtiRigWZ4UzpyePhyn9KAF5zf821BNipU1XGPv",
    "736HfXRewbNn73KB8tQ9wAdgRNNs5Kt77ZFfHeaAm9fy",
    "HBi7S33Cs1UJhAH7k3ReBvLERzxpMnsHvcgZnYjNH9UP",
  ].join("\n"),
  "cred_hyperliquid_walletAddress": "0x5a3ec5Da18e8B1c9B6F1F760e96800d93DC71757",
};

// Seed default wallets synchronously on module load (before React mounts)
if (!localStorage.getItem("_wallets_seeded")) {
  for (const [key, value] of Object.entries(DEFAULT_WALLETS)) {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, value);
    }
  }
  localStorage.setItem("_wallets_seeded", "1");
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

const ALL_PLATFORMS: Platform[] = ["crypto.com", "hyperliquid", "blur", "ethereum", "solana", "bitcoin"];

// Compute initial connection status from what's already in localStorage
function computeInitialStatus(): Record<Platform, ConnectionStatus> {
  const status: Record<Platform, ConnectionStatus> = {
    "crypto.com": "unconfigured",
    hyperliquid: "unconfigured",
    blur: "unconfigured",
    ethereum: "unconfigured",
    solana: "unconfigured",
    bitcoin: "unconfigured",
    other: "unconfigured",
  };
  for (const p of ALL_PLATFORMS) {
    const hasWallet = localStorage.getItem(storageKey(p, "walletAddress"));
    const hasApiKey = localStorage.getItem(storageKey(p, "apiKey"));
    if (hasWallet || hasApiKey) {
      status[p] = "connected";
    }
  }
  return status;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  credentials: {
    "crypto.com": {},
    hyperliquid: {},
    blur: {},
    ethereum: {},
    solana: {},
    bitcoin: {},
    other: {},
  },
  connectionStatus: computeInitialStatus(),
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
      bitcoin: "unconfigured",
      other: "unconfigured",
    };

    for (const p of ALL_PLATFORMS) {
      const hasWallet = localStorage.getItem(storageKey(p, "walletAddress"));
      const hasApiKey = localStorage.getItem(storageKey(p, "apiKey"));
      if (hasWallet || hasApiKey) {
        connectionStatus[p] = "connected";
      }
    }

    set({ currency, autoRefreshInterval, connectionStatus, hydrated: true });
  },

  clearAll: async () => {
    for (const p of ALL_PLATFORMS) {
      for (const key of ["apiKey", "apiSecret", "walletAddress", "heliusApiKey", "etherscanApiKey"]) {
        localStorage.removeItem(storageKey(p, key));
      }
    }
    localStorage.removeItem("settings_currency");
    localStorage.removeItem("settings_autoRefresh");
    localStorage.removeItem("_wallets_seeded");
    set({
      credentials: {
        "crypto.com": {},
        hyperliquid: {},
        blur: {},
        ethereum: {},
        solana: {},
        bitcoin: {},
        other: {},
      },
      connectionStatus: {
        "crypto.com": "unconfigured",
        hyperliquid: "unconfigured",
        blur: "unconfigured",
        ethereum: "unconfigured",
        solana: "unconfigured",
        bitcoin: "unconfigured",
        other: "unconfigured",
      },
      currency: "CAD",
      autoRefreshInterval: 15,
    });
  },
}));
