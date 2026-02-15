import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TradeRecord } from "../types";
import PlatformBadge from "./PlatformBadge";
import { colors, fontSize, spacing, borderRadius } from "../utils/theme";
import { formatUsd, formatAmount, formatDate, formatTime } from "../utils/formatters";

const TYPE_COLORS: Record<string, string> = {
  buy: colors.success,
  sell: colors.danger,
  swap: colors.accent,
  transfer: colors.primaryLight,
  liquidation: colors.danger,
  airdrop: colors.warning,
  other: colors.textMuted,
};

const TYPE_ICONS: Record<string, string> = {
  buy: "arrow-down-circle-outline",
  sell: "arrow-up-circle-outline",
  swap: "swap-horizontal-outline",
  transfer: "send-outline",
  liquidation: "alert-circle-outline",
  airdrop: "gift-outline",
  other: "ellipse-outline",
};

interface TradeRowProps {
  trade: TradeRecord;
}

export default function TradeRow({ trade }: TradeRowProps) {
  const [expanded, setExpanded] = useState(false);
  const typeColor = TYPE_COLORS[trade.type] ?? colors.textMuted;
  const typeIcon = TYPE_ICONS[trade.type] ?? "ellipse-outline";
  const isManual = trade.source === "manual";

  const openTxHash = () => {
    if (!trade.txHash) return;
    let url: string | undefined;
    if (trade.platform === "ethereum") {
      url = `https://etherscan.io/tx/${trade.txHash}`;
    } else if (trade.platform === "solana") {
      url = `https://solscan.io/tx/${trade.txHash}`;
    }
    if (url) Linking.openURL(url);
  };

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.7}
    >
      <View style={styles.mainRow}>
        <View style={[styles.typeIcon, { backgroundColor: typeColor + "20" }]}>
          <Ionicons name={typeIcon as any} size={20} color={typeColor} />
        </View>

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.asset}>{trade.asset}</Text>
            <View style={[styles.typeBadge, { backgroundColor: typeColor + "20" }]}>
              <Text style={[styles.typeBadgeText, { color: typeColor }]}>
                {trade.type.toUpperCase()}
              </Text>
            </View>
            {isManual && (
              <View style={styles.customBadge}>
                <Text style={styles.customBadgeText}>Custom</Text>
              </View>
            )}
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.date}>{formatDate(trade.date)}</Text>
            <PlatformBadge platform={trade.platform} small />
          </View>
        </View>

        <View style={styles.values}>
          <Text style={styles.amount}>
            {formatAmount(trade.amount)} {trade.asset}
          </Text>
          <Text style={styles.value}>
            {trade.totalValueUsd > 0 ? formatUsd(trade.totalValueUsd) : "—"}
          </Text>
          {trade.gainLossUsd != null && trade.gainLossUsd !== 0 && (
            <Text
              style={[
                styles.gainLoss,
                {
                  color:
                    trade.gainLossUsd >= 0 ? colors.success : colors.danger,
                },
              ]}
            >
              {trade.gainLossUsd >= 0 ? "+" : ""}
              {formatUsd(trade.gainLossUsd)}
            </Text>
          )}
        </View>
      </View>

      {expanded && (
        <View style={styles.details}>
          <DetailLine label="Date & Time" value={`${formatDate(trade.date)} ${formatTime(trade.date)}`} />
          <DetailLine label="Price" value={trade.priceUsd > 0 ? formatUsd(trade.priceUsd) : "—"} />
          <DetailLine label="Total Value" value={trade.totalValueUsd > 0 ? formatUsd(trade.totalValueUsd) : "—"} />
          <DetailLine label="Fees" value={trade.feesUsd > 0 ? formatUsd(trade.feesUsd) : "—"} />
          {trade.costBasisUsd != null && (
            <DetailLine label="Cost Basis" value={formatUsd(trade.costBasisUsd)} />
          )}
          {trade.gainLossUsd != null && (
            <DetailLine label="Gain/Loss" value={formatUsd(trade.gainLossUsd)} />
          )}
          {trade.txHash && (
            <TouchableOpacity onPress={openTxHash} style={styles.txRow}>
              <Text style={styles.detailLabel}>TX Hash</Text>
              <Text style={styles.txLink}>
                {trade.txHash.slice(0, 10)}...{trade.txHash.slice(-6)}
              </Text>
              <Ionicons name="open-outline" size={12} color={colors.primaryLight} />
            </TouchableOpacity>
          )}
          {trade.notes && <DetailLine label="Notes" value={trade.notes} />}
          <DetailLine label="Source" value={trade.source === "manual" ? "Manual Entry" : "API"} />
        </View>
      )}
    </TouchableOpacity>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    flexWrap: "wrap",
  },
  asset: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  customBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: colors.warning + "25",
  },
  customBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.warning,
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 3,
  },
  date: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  values: {
    alignItems: "flex-end",
    marginLeft: spacing.sm,
  },
  amount: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  value: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  gainLoss: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    marginTop: 2,
  },
  details: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  detailValue: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: "500",
    maxWidth: "60%",
    textAlign: "right",
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
    gap: spacing.xs,
  },
  txLink: {
    color: colors.primaryLight,
    fontSize: fontSize.sm,
    fontWeight: "500",
    flex: 1,
    textAlign: "right",
  },
});
