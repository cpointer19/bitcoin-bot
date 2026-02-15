import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fontSize, spacing } from "../utils/theme";

export default function DashboardScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="pie-chart-outline" size={64} color={colors.textMuted} />
      <Text style={styles.title}>Portfolio Dashboard</Text>
      <Text style={styles.subtitle}>
        Connect your wallets in Settings to see your total crypto exposure.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: "700",
    marginTop: spacing.lg,
    textAlign: "center",
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: spacing.sm,
    textAlign: "center",
    lineHeight: 22,
  },
});
