import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PortfolioHolding } from "../types";
import PlatformBadge from "./PlatformBadge";
import { colors, fontSize, spacing, borderRadius } from "../utils/theme";
import { formatUsd, formatPercent, formatAmount } from "../utils/formatters";

// Map asset symbols to Ionicons (fallback to generic)
const ASSET_ICONS: Record<string, string> = {
  BTC: "logo-bitcoin",
  ETH: "diamond-outline",
  SOL: "flash-outline",
  USDT: "cash-outline",
  USDC: "cash-outline",
};

interface AssetRowProps {
  holding: PortfolioHolding;
  onPress?: () => void;
}

export default function AssetRow({ holding, onPress }: AssetRowProps) {
  const isPositive = holding.change24hPercent >= 0;
  const changeColor = isPositive ? colors.success : colors.danger;
  const iconName = ASSET_ICONS[holding.asset.toUpperCase()] ?? "ellipse-outline";

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <Ionicons name={iconName as any} size={24} color={colors.primaryLight} />
      </View>

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{holding.asset}</Text>
          <PlatformBadge platform={holding.platform} small />
        </View>
        <Text style={styles.amount}>
          {formatAmount(holding.amount)} {holding.asset}
        </Text>
      </View>

      <View style={styles.values}>
        <Text style={styles.value}>{formatUsd(holding.currentValueUsd)}</Text>
        <Text style={[styles.change, { color: changeColor }]}>
          {formatPercent(holding.change24hPercent)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  amount: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  values: {
    alignItems: "flex-end",
  },
  value: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  change: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
});
