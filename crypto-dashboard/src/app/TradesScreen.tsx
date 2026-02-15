import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTradesStore } from "../stores/trades";
import { useManualEntriesStore } from "../stores/manual-entries";
import TradeRow from "../components/TradeRow";
import { TradeRecord, Platform, TradeType } from "../types";
import { colors, fontSize, spacing, borderRadius } from "../utils/theme";

type PlatformFilter = "all" | Platform;
type TypeFilter = "all" | TradeType | "custom";
type DateFilter = "all" | "ytd" | "q1" | "q2" | "q3" | "q4" | "2025";

const PLATFORM_OPTIONS: { value: PlatformFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "crypto.com", label: "Crypto.com" },
  { value: "hyperliquid", label: "Hyperliquid" },
  { value: "blur", label: "Blur" },
  { value: "ethereum", label: "ETH" },
  { value: "solana", label: "SOL" },
];

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "swap", label: "Swap" },
  { value: "transfer", label: "Transfer" },
  { value: "liquidation", label: "Liquidation" },
  { value: "custom", label: "Custom" },
];

const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "2025", label: "2025" },
  { value: "ytd", label: "YTD" },
  { value: "q1", label: "Q1" },
  { value: "q2", label: "Q2" },
  { value: "q3", label: "Q3" },
  { value: "q4", label: "Q4" },
];

function getDateRange(filter: DateFilter): { start: Date; end: Date } | null {
  const now = new Date();
  const year = now.getFullYear();

  switch (filter) {
    case "all":
      return null;
    case "ytd":
      return { start: new Date(year, 0, 1), end: now };
    case "2025":
      return {
        start: new Date(2025, 0, 1),
        end: new Date(2025, 11, 31, 23, 59, 59),
      };
    case "q1":
      return { start: new Date(year, 0, 1), end: new Date(year, 2, 31, 23, 59, 59) };
    case "q2":
      return { start: new Date(year, 3, 1), end: new Date(year, 5, 30, 23, 59, 59) };
    case "q3":
      return { start: new Date(year, 6, 1), end: new Date(year, 8, 30, 23, 59, 59) };
    case "q4":
      return { start: new Date(year, 9, 1), end: new Date(year, 11, 31, 23, 59, 59) };
    default:
      return null;
  }
}

export default function TradesScreen() {
  const { trades } = useTradesStore();
  const { entries: manualEntries } = useManualEntriesStore();

  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Merge API trades with manual entries
  const allTrades: TradeRecord[] = useMemo(() => {
    const merged = [...trades, ...manualEntries];
    return merged.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [trades, manualEntries]);

  // Apply filters
  const filteredTrades = useMemo(() => {
    let result = allTrades;

    if (platformFilter !== "all") {
      result = result.filter((t) => t.platform === platformFilter);
    }

    if (typeFilter === "custom") {
      result = result.filter((t) => t.source === "manual");
    } else if (typeFilter !== "all") {
      result = result.filter((t) => t.type === typeFilter);
    }

    const dateRange = getDateRange(dateFilter);
    if (dateRange) {
      result = result.filter((t) => {
        const d = new Date(t.date);
        return d >= dateRange.start && d <= dateRange.end;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.asset.toLowerCase().includes(q) ||
          t.txHash?.toLowerCase().includes(q) ||
          t.notes?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [allTrades, platformFilter, typeFilter, dateFilter, searchQuery]);

  const isEmpty = allTrades.length === 0;

  if (isEmpty) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons
          name="swap-horizontal-outline"
          size={64}
          color={colors.textMuted}
        />
        <Text style={styles.emptyTitle}>Transaction History</Text>
        <Text style={styles.emptySubtitle}>
          Your trades across all platforms will appear here. Connect wallets in
          Settings and refresh the Dashboard, or add manual entries.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search asset or tx hash..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Rows */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        {PLATFORM_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.value}
            label={opt.label}
            active={platformFilter === opt.value}
            onPress={() => setPlatformFilter(opt.value)}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        {TYPE_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.value}
            label={opt.label}
            active={typeFilter === opt.value}
            onPress={() => setTypeFilter(opt.value)}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        {DATE_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.value}
            label={opt.label}
            active={dateFilter === opt.value}
            onPress={() => setDateFilter(opt.value)}
          />
        ))}
      </ScrollView>

      {/* Results Count */}
      <Text style={styles.resultCount}>
        {filteredTrades.length} trade{filteredTrades.length !== 1 ? "s" : ""}
      </Text>

      {/* Trade List */}
      <FlatList
        data={filteredTrades}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TradeRow trade={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.noResults}>
            <Text style={styles.noResultsText}>
              No trades match your filters.
            </Text>
          </View>
        }
      />
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: "700",
    marginTop: spacing.lg,
    textAlign: "center",
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: spacing.sm,
    textAlign: "center",
    lineHeight: 22,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    margin: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    color: colors.text,
    fontSize: fontSize.md,
  },
  filterRow: {
    maxHeight: 40,
    marginBottom: spacing.xs,
  },
  filterContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary + "40",
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  chipTextActive: {
    color: colors.primaryLight,
  },
  resultCount: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginLeft: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  noResults: {
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  noResultsText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
});
