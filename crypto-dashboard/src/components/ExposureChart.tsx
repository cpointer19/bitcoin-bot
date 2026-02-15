import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { PortfolioHolding, Platform } from "../types";
import { colors, fontSize, spacing, borderRadius } from "../utils/theme";
import { formatUsd } from "../utils/formatters";

const PLATFORM_COLORS: Record<Platform, string> = {
  "crypto.com": "#1A6CDB",
  hyperliquid: "#7B3FE4",
  blur: "#FF6B00",
  ethereum: "#627EEA",
  solana: "#14F195",
  other: "#A0A0B0",
};

const PLATFORM_LABELS: Record<Platform, string> = {
  "crypto.com": "Crypto.com",
  hyperliquid: "Hyperliquid",
  blur: "Blur",
  ethereum: "Ethereum",
  solana: "Solana",
  other: "Other",
};

const ASSET_COLORS = [
  "#627EEA",
  "#14F195",
  "#FF6B00",
  "#7B3FE4",
  "#1A6CDB",
  "#FDCB6E",
  "#FF6B6B",
  "#00D2D3",
];

interface ExposureChartProps {
  holdings: PortfolioHolding[];
  mode: "platform" | "asset";
}

export default function ExposureChart({ holdings, mode }: ExposureChartProps) {
  if (holdings.length === 0) return null;

  let segments: { name: string; value: number; color: string }[];

  if (mode === "platform") {
    const byPlatform: Record<string, number> = {};
    for (const h of holdings) {
      byPlatform[h.platform] = (byPlatform[h.platform] ?? 0) + h.currentValueUsd;
    }
    segments = Object.entries(byPlatform)
      .sort((a, b) => b[1] - a[1])
      .map(([platform, value], i) => ({
        name: PLATFORM_LABELS[platform as Platform] ?? platform,
        value,
        color: PLATFORM_COLORS[platform as Platform] ?? ASSET_COLORS[i % ASSET_COLORS.length],
      }));
  } else {
    const byAsset: Record<string, number> = {};
    for (const h of holdings) {
      byAsset[h.asset] = (byAsset[h.asset] ?? 0) + h.currentValueUsd;
    }
    segments = Object.entries(byAsset)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([asset, value], i) => ({
        name: asset,
        value,
        color: ASSET_COLORS[i % ASSET_COLORS.length],
      }));
  }

  segments = segments.filter((d) => d.value > 0);
  if (segments.length === 0) return null;

  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Exposure by {mode === "platform" ? "Platform" : "Asset"}
      </Text>

      {/* Stacked horizontal bar */}
      <View style={styles.bar}>
        {segments.map((seg, i) => {
          const pct = (seg.value / total) * 100;
          if (pct < 0.5) return null;
          return (
            <View
              key={seg.name}
              style={{
                flex: pct,
                height: 20,
                backgroundColor: seg.color,
                borderTopLeftRadius: i === 0 ? 6 : 0,
                borderBottomLeftRadius: i === 0 ? 6 : 0,
                borderTopRightRadius: i === segments.length - 1 ? 6 : 0,
                borderBottomRightRadius: i === segments.length - 1 ? 6 : 0,
              }}
            />
          );
        })}
      </View>

      {/* Legend rows */}
      <View style={styles.legend}>
        {segments.map((seg) => {
          const pct = ((seg.value / total) * 100).toFixed(1);
          return (
            <View key={seg.name} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: seg.color }]} />
              <Text style={styles.legendName} numberOfLines={1}>
                {seg.name}
              </Text>
              <Text style={styles.legendPct}>{pct}%</Text>
              <Text style={styles.legendValue}>{formatUsd(seg.value)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  bar: {
    flexDirection: "row",
    height: 20,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  legend: {
    gap: spacing.xs,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendName: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    flex: 1,
  },
  legendPct: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    width: 48,
    textAlign: "right",
  },
  legendValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: "500",
    width: 90,
    textAlign: "right",
  },
});
