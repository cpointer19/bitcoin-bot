import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, fontSize, spacing, borderRadius } from "../utils/theme";
import { formatUsd, formatPercent, timeAgo } from "../utils/formatters";

interface PortfolioCardProps {
  totalValueUsd: number;
  change24hUsd: number;
  change24hPercent: number;
  lastRefreshed: string | null;
}

export default function PortfolioCard({
  totalValueUsd,
  change24hUsd,
  change24hPercent,
  lastRefreshed,
}: PortfolioCardProps) {
  const isPositive = change24hPercent >= 0;
  const changeColor = isPositive ? colors.success : colors.danger;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Total Portfolio Value</Text>
      <Text style={styles.value}>{formatUsd(totalValueUsd)}</Text>
      <View style={styles.changeRow}>
        <Text style={[styles.changeAmount, { color: changeColor }]}>
          {isPositive ? "+" : ""}
          {formatUsd(change24hUsd)}
        </Text>
        <View
          style={[
            styles.changeBadge,
            { backgroundColor: changeColor + "20" },
          ]}
        >
          <Text style={[styles.changePercent, { color: changeColor }]}>
            {formatPercent(change24hPercent)}
          </Text>
        </View>
        <Text style={styles.changeLabel}>24h</Text>
      </View>
      {lastRefreshed && (
        <Text style={styles.refreshed}>
          Updated {timeAgo(lastRefreshed)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: "500",
  },
  value: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  changeAmount: {
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  changeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  changePercent: {
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  changeLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  refreshed: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
  },
});
