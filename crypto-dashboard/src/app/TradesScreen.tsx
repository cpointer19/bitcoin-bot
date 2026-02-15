import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fontSize, spacing } from "../utils/theme";

export default function TradesScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="swap-horizontal-outline" size={64} color={colors.textMuted} />
      <Text style={styles.title}>Transaction History</Text>
      <Text style={styles.subtitle}>
        Your trades across all platforms will appear here with filtering and
        export options.
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
