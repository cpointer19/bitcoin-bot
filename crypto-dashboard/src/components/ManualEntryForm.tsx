import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ManualEntry, Platform, TradeType } from "../types";
import { colors, fontSize, spacing, borderRadius } from "../utils/theme";

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "crypto.com", label: "Crypto.com" },
  { value: "hyperliquid", label: "Hyperliquid" },
  { value: "blur", label: "Blur" },
  { value: "ethereum", label: "Ethereum" },
  { value: "solana", label: "Solana" },
  { value: "other", label: "Other" },
];

const TRADE_TYPES: { value: TradeType; label: string }[] = [
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "swap", label: "Swap" },
  { value: "transfer", label: "Transfer" },
  { value: "liquidation", label: "Liquidation" },
  { value: "airdrop", label: "Airdrop" },
  { value: "other", label: "Other" },
];

interface ManualEntryFormProps {
  initialValues?: Partial<ManualEntry>;
  onSave: (entry: ManualEntry) => void;
  onCancel: () => void;
  isEditing?: boolean;
}

export default function ManualEntryForm({
  initialValues,
  onSave,
  onCancel,
  isEditing = false,
}: ManualEntryFormProps) {
  const [platform, setPlatform] = useState<Platform>(
    initialValues?.platform ?? "blur"
  );
  const [type, setType] = useState<TradeType>(
    initialValues?.type ?? "liquidation"
  );
  const [date, setDate] = useState(
    initialValues?.date
      ? initialValues.date.split("T")[0]
      : new Date().toISOString().split("T")[0]
  );
  const [asset, setAsset] = useState(initialValues?.asset ?? "");
  const [amount, setAmount] = useState(
    initialValues?.amount ? String(initialValues.amount) : ""
  );
  const [priceUsd, setPriceUsd] = useState(
    initialValues?.priceUsd ? String(initialValues.priceUsd) : ""
  );
  const [totalValueUsd, setTotalValueUsd] = useState(
    initialValues?.totalValueUsd ? String(initialValues.totalValueUsd) : ""
  );
  const [feesUsd, setFeesUsd] = useState(
    initialValues?.feesUsd ? String(initialValues.feesUsd) : ""
  );
  const [costBasisUsd, setCostBasisUsd] = useState(
    initialValues?.costBasisUsd != null ? String(initialValues.costBasisUsd) : ""
  );
  const [gainLossUsd, setGainLossUsd] = useState(
    initialValues?.gainLossUsd != null ? String(initialValues.gainLossUsd) : ""
  );
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [txHash, setTxHash] = useState(initialValues?.txHash ?? "");

  // Auto-calculate total value
  useEffect(() => {
    const a = parseFloat(amount);
    const p = parseFloat(priceUsd);
    if (!isNaN(a) && !isNaN(p) && a > 0 && p > 0) {
      setTotalValueUsd(String((a * p).toFixed(2)));
    }
  }, [amount, priceUsd]);

  // Auto-calculate gain/loss
  useEffect(() => {
    const total = parseFloat(totalValueUsd);
    const cost = parseFloat(costBasisUsd);
    if (!isNaN(total) && !isNaN(cost) && cost > 0) {
      setGainLossUsd(String((total - cost).toFixed(2)));
    }
  }, [totalValueUsd, costBasisUsd]);

  const handleSave = () => {
    if (!asset.trim()) {
      Alert.alert("Required", "Please enter an asset name.");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert("Required", "Please enter a valid amount.");
      return;
    }

    const now = new Date().toISOString();
    const entry: ManualEntry = {
      id: initialValues?.id ?? `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: new Date(date).toISOString(),
      platform,
      type,
      asset: asset.trim(),
      amount: parseFloat(amount) || 0,
      priceUsd: parseFloat(priceUsd) || 0,
      totalValueUsd: parseFloat(totalValueUsd) || 0,
      feesUsd: parseFloat(feesUsd) || 0,
      costBasisUsd: costBasisUsd ? parseFloat(costBasisUsd) : undefined,
      gainLossUsd: gainLossUsd ? parseFloat(gainLossUsd) : undefined,
      txHash: txHash.trim() || undefined,
      source: "manual",
      notes: notes.trim() || undefined,
      createdAt: initialValues?.createdAt ?? now,
      updatedAt: now,
    };

    onSave(entry);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Date */}
      <Text style={styles.label}>Date</Text>
      <TextInput
        style={styles.input}
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.textMuted}
      />

      {/* Platform */}
      <Text style={styles.label}>Platform</Text>
      <View style={styles.optionRow}>
        {PLATFORMS.map((p) => (
          <TouchableOpacity
            key={p.value}
            style={[
              styles.optionChip,
              platform === p.value && styles.optionChipActive,
            ]}
            onPress={() => setPlatform(p.value)}
          >
            <Text
              style={[
                styles.optionText,
                platform === p.value && styles.optionTextActive,
              ]}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Type */}
      <Text style={styles.label}>Type</Text>
      <View style={styles.optionRow}>
        {TRADE_TYPES.map((t) => (
          <TouchableOpacity
            key={t.value}
            style={[
              styles.optionChip,
              type === t.value && styles.optionChipActive,
            ]}
            onPress={() => setType(t.value)}
          >
            <Text
              style={[
                styles.optionText,
                type === t.value && styles.optionTextActive,
              ]}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Asset Name */}
      <Text style={styles.label}>Asset Name *</Text>
      <TextInput
        style={styles.input}
        value={asset}
        onChangeText={setAsset}
        placeholder="e.g., ETH, BTC, Pudgy Penguins"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
      />

      {/* Amount */}
      <Text style={styles.label}>Amount *</Text>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
      />

      {/* Price per unit */}
      <Text style={styles.label}>Price per unit (USD)</Text>
      <TextInput
        style={styles.input}
        value={priceUsd}
        onChangeText={setPriceUsd}
        placeholder="0.00"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
      />

      {/* Total Value */}
      <Text style={styles.label}>Total Value (USD) — auto-calculated</Text>
      <TextInput
        style={styles.input}
        value={totalValueUsd}
        onChangeText={setTotalValueUsd}
        placeholder="Auto-calculated or override"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
      />

      {/* Fees */}
      <Text style={styles.label}>Fees (USD, optional)</Text>
      <TextInput
        style={styles.input}
        value={feesUsd}
        onChangeText={setFeesUsd}
        placeholder="0.00"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
      />

      {/* Cost Basis */}
      <Text style={styles.label}>Cost Basis (USD, optional — for tax calc)</Text>
      <TextInput
        style={styles.input}
        value={costBasisUsd}
        onChangeText={setCostBasisUsd}
        placeholder="Original purchase cost"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
      />

      {/* Gain/Loss */}
      <Text style={styles.label}>Gain/Loss (USD) — auto-calculated if cost basis provided</Text>
      <TextInput
        style={styles.input}
        value={gainLossUsd}
        onChangeText={setGainLossUsd}
        placeholder="Auto-calculated or override"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
      />

      {/* Notes */}
      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={notes}
        onChangeText={setNotes}
        placeholder='e.g., "Blur NFT liquidation, collection X"'
        placeholderTextColor={colors.textMuted}
        multiline
        numberOfLines={3}
      />

      {/* TX Hash */}
      <Text style={styles.label}>TX Hash / Reference (optional)</Text>
      <TextInput
        style={styles.input}
        value={txHash}
        onChangeText={setTxHash}
        placeholder="0x... or reference ID"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
      />

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Ionicons name="checkmark-outline" size={20} color={colors.text} />
          <Text style={styles.saveBtnText}>
            {isEditing ? "Update Entry" : "Save Entry"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
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
    paddingBottom: spacing.xl * 3,
  },
  label: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: fontSize.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  optionChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: "500",
  },
  optionTextActive: {
    color: colors.text,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  saveBtnText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: "600",
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  cancelBtnText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
});
