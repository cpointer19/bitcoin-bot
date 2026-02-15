import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Platform } from "../types";
import { colors, fontSize, spacing, borderRadius } from "../utils/theme";

const PLATFORM_LABELS: Record<Platform, string> = {
  "crypto.com": "Crypto.com",
  hyperliquid: "Hyperliquid",
  blur: "Blur",
  ethereum: "Ethereum",
  solana: "Solana",
  other: "Other",
};

const PLATFORM_COLORS: Record<Platform, string> = {
  "crypto.com": "#1A3C6D",
  hyperliquid: "#3A1D6E",
  blur: "#FF6B00",
  ethereum: "#627EEA",
  solana: "#9945FF",
  other: colors.textMuted,
};

interface PlatformBadgeProps {
  platform: Platform;
  small?: boolean;
}

export default function PlatformBadge({ platform, small }: PlatformBadgeProps) {
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: PLATFORM_COLORS[platform] + "30" },
        small && styles.badgeSmall,
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: PLATFORM_COLORS[platform] },
          small && styles.textSmall,
        ]}
      >
        {PLATFORM_LABELS[platform]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  badgeSmall: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
  },
  text: {
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  textSmall: {
    fontSize: 9,
  },
});
