import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fontSize, spacing } from "../utils/theme";

export default function ManualEntryScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="create-outline" size={64} color={colors.textMuted} />
      <Text style={styles.title}>Manual Entry</Text>
      <Text style={styles.subtitle}>
        Add custom transactions that don't appear via API — like the Blur NFT
        liquidation loss.
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
