import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { PieChart } from "react-native-chart-kit";
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

interface ExposureChartProps {
  holdings: PortfolioHolding[];
  mode: "platform" | "asset";
}

export default function ExposureChart({ holdings, mode }: ExposureChartProps) {
  if (holdings.length === 0) return null;

  const screenWidth = Dimensions.get("window").width - spacing.md * 2;
  const chartColors = [
    "#627EEA",
    "#14F195",
    "#FF6B00",
    "#7B3FE4",
    "#1A6CDB",
    "#FDCB6E",
    "#FF6B6B",
    "#00D2D3",
  ];

  let chartData: { name: string; value: number; color: string; legendFontColor: string; legendFontSize: number }[];

  if (mode === "platform") {
    // Aggregate by platform
    const byPlatform: Record<string, number> = {};
    for (const h of holdings) {
      byPlatform[h.platform] = (byPlatform[h.platform] ?? 0) + h.currentValueUsd;
    }

    chartData = Object.entries(byPlatform)
      .sort((a, b) => b[1] - a[1])
      .map(([platform, value], i) => ({
        name: PLATFORM_LABELS[platform as Platform] ?? platform,
        value,
        color: PLATFORM_COLORS[platform as Platform] ?? chartColors[i % chartColors.length],
        legendFontColor: colors.textSecondary,
        legendFontSize: 12,
      }));
  } else {
    // Aggregate by asset
    const byAsset: Record<string, number> = {};
    for (const h of holdings) {
      byAsset[h.asset] = (byAsset[h.asset] ?? 0) + h.currentValueUsd;
    }

    chartData = Object.entries(byAsset)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([asset, value], i) => ({
        name: asset,
        value,
        color: chartColors[i % chartColors.length],
        legendFontColor: colors.textSecondary,
        legendFontSize: 12,
      }));
  }

  // Filter out zero values
  chartData = chartData.filter((d) => d.value > 0);
  if (chartData.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Exposure by {mode === "platform" ? "Platform" : "Asset"}
      </Text>
      <PieChart
        data={chartData.map((d) => ({
          ...d,
          population: d.value,
        }))}
        width={screenWidth}
        height={180}
        chartConfig={{
          color: () => colors.text,
          labelColor: () => colors.textSecondary,
        }}
        accessor="population"
        backgroundColor="transparent"
        paddingLeft="0"
        absolute={false}
      />
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
});
