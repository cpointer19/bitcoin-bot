import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, ConnectionStatus } from "../types";

interface PlatformCredentials {
  [key: string]: string; // e.g. "apiKey", "apiSecret", "walletAddress"
}

interface SettingsState {
  credentials: Record<Platform, PlatformCredentials>;
  connectionStatus: Record<Platform, ConnectionStatus>;
  currency: "USD" | "CAD";
  autoRefreshInterval: 5 | 15 | 30 | 0; // 0 = manual only
  hydrated: boolean;

  setCredential: (
    platform: Platform,
    key: string,
    value: string
  ) => Promise<void>;
  getCredential: (platform: Platform, key: string) => Promise<string | null>;
  setConnectionStatus: (
    platform: Platform,
    status: ConnectionStatus
  ) => void;
  setCurrency: (currency: "USD" | "CAD") => void;
  setAutoRefreshInterval: (interval: 5 | 15 | 30 | 0) => void;
  hydrate: () => Promise<void>;
  clearAll: () => Promise<void>;
}

const secureKey = (platform: Platform, key: string) =>
  `cred_${platform}_${key}`;

const PLATFORMS: Platform[] = [
  "crypto.com",
  "hyperliquid",
  "blur",
  "ethereum",
  "solana",
];

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
    const sk = secureKey(platform, key);
    if (value) {
      await SecureStore.setItemAsync(sk, value);
    } else {
      await SecureStore.deleteItemAsync(sk);
    }
    set((state) => ({
      credentials: {
        ...state.credentials,
        [platform]: {
          ...state.credentials[platform],
          [key]: value ? "••••••••" : "",
        },
      },
    }));
  },

  getCredential: async (platform, key) => {
    const sk = secureKey(platform, key);
    return SecureStore.getItemAsync(sk);
  },

  setConnectionStatus: (platform, status) =>
    set((state) => ({
      connectionStatus: {
        ...state.connectionStatus,
        [platform]: status,
      },
    })),

  setCurrency: (currency) => {
    set({ currency });
    AsyncStorage.setItem("settings_currency", currency);
  },

  setAutoRefreshInterval: (interval) => {
    set({ autoRefreshInterval: interval });
    AsyncStorage.setItem("settings_autoRefresh", String(interval));
  },

  hydrate: async () => {
    const currency =
      ((await AsyncStorage.getItem("settings_currency")) as
        | "USD"
        | "CAD"
        | null) ?? "CAD";
    const autoRefreshRaw = await AsyncStorage.getItem("settings_autoRefresh");
    const autoRefreshInterval = autoRefreshRaw
      ? (Number(autoRefreshRaw) as 5 | 15 | 30 | 0)
      : 15;

    // Check which platforms have saved credentials (check for masked values)
    const connectionStatus: Record<Platform, ConnectionStatus> = {
      "crypto.com": "unconfigured",
      hyperliquid: "unconfigured",
      blur: "unconfigured",
      ethereum: "unconfigured",
      solana: "unconfigured",
      other: "unconfigured",
    };

    for (const p of PLATFORMS) {
      const hasAnyKey = await SecureStore.getItemAsync(
        secureKey(p, "walletAddress")
      );
      const hasApiKey = await SecureStore.getItemAsync(
        secureKey(p, "apiKey")
      );
      if (hasAnyKey || hasApiKey) {
        connectionStatus[p] = "connected";
      }
    }

    set({ currency, autoRefreshInterval, connectionStatus, hydrated: true });
  },

  clearAll: async () => {
    for (const p of PLATFORMS) {
      for (const key of ["apiKey", "apiSecret", "walletAddress", "heliusApiKey", "etherscanApiKey"]) {
        await SecureStore.deleteItemAsync(secureKey(p, key));
      }
    }
    await AsyncStorage.multiRemove(["settings_currency", "settings_autoRefresh"]);
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
