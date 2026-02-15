import { PlatformConfig } from "../types";

export const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    platform: "crypto.com",
    label: "Crypto.com",
    icon: "logo-bitcoin",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        placeholder: "Enter Crypto.com API key",
        secure: true,
      },
      {
        key: "apiSecret",
        label: "API Secret",
        placeholder: "Enter Crypto.com API secret",
        secure: true,
      },
    ],
  },
  {
    platform: "hyperliquid",
    label: "Hyperliquid",
    icon: "trending-up",
    fields: [
      {
        key: "walletAddress",
        label: "Wallet Address",
        placeholder: "0x...",
        secure: false,
      },
    ],
  },
  {
    platform: "blur",
    label: "Blur",
    icon: "image-outline",
    fields: [
      {
        key: "walletAddress",
        label: "Wallet Address",
        placeholder: "0x...",
        secure: false,
      },
    ],
  },
  {
    platform: "ethereum",
    label: "Ethereum",
    icon: "diamond-outline",
    fields: [
      {
        key: "walletAddress",
        label: "Wallet Address",
        placeholder: "0x...",
        secure: false,
      },
      {
        key: "etherscanApiKey",
        label: "Etherscan API Key (optional)",
        placeholder: "Enter Etherscan API key",
        secure: true,
      },
    ],
  },
  {
    platform: "solana",
    label: "Solana",
    icon: "flash-outline",
    fields: [
      {
        key: "walletAddress",
        label: "Wallet Address",
        placeholder: "Your Solana address",
        secure: false,
      },
      {
        key: "heliusApiKey",
        label: "Helius API Key (optional)",
        placeholder: "Enter Helius API key",
        secure: true,
      },
    ],
  },
];
