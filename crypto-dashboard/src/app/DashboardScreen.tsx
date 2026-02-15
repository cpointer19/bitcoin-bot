import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePortfolioStore } from "../stores/portfolio";
import { useTradesStore } from "../stores/trades";
import { fetchAllPlatformData } from "../services/aggregator";
import PortfolioCard from "../components/PortfolioCard";
import AssetRow from "../components/AssetRow";
import ExposureChart from "../components/ExposureChart";
import { PortfolioHolding } from "../types";
import { colors, fontSize, spacing, borderRadius } from "../utils/theme";

type SortKey = "value" | "name" | "change";
type ChartMode = "platform" | "asset";

export default function DashboardScreen() {
  const {
    holdings,
    totalValueUsd,
    change24hUsd,
    change24hPercent,
    lastRefreshed,
    loading,
    error,
    setHoldings,
    setLoading,
    setError,
  } = usePortfolioStore();
  const { setTrades } = useTradesStore();

  const [sortBy, setSortBy] = useState<SortKey>("value");
  const [chartMode, setChartMode] = useState<ChartMode>("platform");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setLoading(true);
    setError(null);

    try {
      const result = await fetchAllPlatformData();
      setHoldings(result.holdings);
      setTrades(result.trades);

      if (result.errors.length > 0) {
        const errorMsg = result.errors
          .map((e) => `${e.platform}: ${e.error}`)
          .join("; ");
        setError(errorMsg);
      }
    } catch (err: any) {
      setError(err.message ?? "Failed to fetch data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const sortedHoldings = [...holdings].sort((a, b) => {
    switch (sortBy) {
      case "value":
        return b.currentValueUsd - a.currentValueUsd;
      case "name":
        return a.asset.localeCompare(b.asset);
      case "change":
        return b.change24hPercent - a.change24hPercent;
      default:
        return 0;
    }
  });

  const isEmpty = holdings.length === 0 && !loading;

  if (isEmpty && !error) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.emptyContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primaryLight}
          />
        }
      >
        <Ionicons
          name="pie-chart-outline"
          size={64}
          color={colors.textMuted}
        />
        <Text style={styles.emptyTitle}>Portfolio Dashboard</Text>
        <Text style={styles.emptySubtitle}>
          Connect your wallets in Settings, then pull down to refresh.
        </Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={handleRefresh}>
          <Ionicons name="refresh-outline" size={18} color={colors.text} />
          <Text style={styles.refreshBtnText}>Refresh Data</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primaryLight}
        />
      }
    >
      {loading && !refreshing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primaryLight} />
          <Text style={styles.loadingText}>Loading portfolio...</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={16} color={colors.warning} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <PortfolioCard
        totalValueUsd={totalValueUsd}
        change24hUsd={change24hUsd}
        change24hPercent={change24hPercent}
        lastRefreshed={lastRefreshed}
      />

      {/* Exposure Chart */}
      <View style={styles.chartToggleRow}>
        {(["platform", "asset"] as ChartMode[]).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[
              styles.toggleChip,
              chartMode === mode && styles.toggleChipActive,
            ]}
            onPress={() => setChartMode(mode)}
          >
            <Text
              style={[
                styles.toggleChipText,
                chartMode === mode && styles.toggleChipTextActive,
              ]}
            >
              By {mode === "platform" ? "Platform" : "Asset"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <ExposureChart holdings={holdings} mode={chartMode} />

      {/* Sort Controls */}
      <View style={styles.sortRow}>
        <Text style={styles.sectionTitle}>Holdings</Text>
        <View style={styles.sortOptions}>
          {(["value", "name", "change"] as SortKey[]).map((key) => (
            <TouchableOpacity
              key={key}
              onPress={() => setSortBy(key)}
              style={[
                styles.sortChip,
                sortBy === key && styles.sortChipActive,
              ]}
            >
              <Text
                style={[
                  styles.sortChipText,
                  sortBy === key && styles.sortChipTextActive,
                ]}
              >
                {key === "value" ? "Value" : key === "name" ? "Name" : "24h %"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Asset List */}
      {sortedHoldings.map((holding, index) => (
        <AssetRow key={`${holding.platform}-${holding.asset}-${index}`} holding={holding} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  emptyContainer: {
    flex: 1,
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
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  refreshBtnText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  loadingOverlay: {
    alignItems: "center",
    paddingVertical: spacing.lg,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.warning + "15",
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  errorText: {
    color: colors.warning,
    fontSize: fontSize.sm,
    flex: 1,
  },
  chartToggleRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  toggleChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceLight,
  },
  toggleChipActive: {
    backgroundColor: colors.primary,
  },
  toggleChipText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: "500",
  },
  toggleChipTextActive: {
    color: colors.text,
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: "600",
  },
  sortOptions: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  sortChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceLight,
  },
  sortChipActive: {
    backgroundColor: colors.primary + "40",
  },
  sortChipText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: "500",
  },
  sortChipTextActive: {
    color: colors.primaryLight,
  },
});
