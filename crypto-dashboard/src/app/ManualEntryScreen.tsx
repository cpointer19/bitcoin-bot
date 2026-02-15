import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useManualEntriesStore } from "../stores/manual-entries";
import ManualEntryForm from "../components/ManualEntryForm";
import { ManualEntry } from "../types";
import { colors, fontSize, spacing, borderRadius } from "../utils/theme";
import { formatUsd, formatDate } from "../utils/formatters";

// Pre-filled template for Blur NFT liquidation
const BLUR_LIQUIDATION_TEMPLATE: Partial<ManualEntry> = {
  platform: "blur",
  type: "liquidation",
  notes: "Blur NFT liquidation",
};

type ScreenMode = "list" | "create" | "edit";

export default function ManualEntryScreen() {
  const { entries, addEntry, updateEntry, deleteEntry } = useManualEntriesStore();
  const [mode, setMode] = useState<ScreenMode>("list");
  const [editingEntry, setEditingEntry] = useState<ManualEntry | null>(null);
  const [template, setTemplate] = useState<Partial<ManualEntry> | undefined>();

  const handleCreate = (tmpl?: Partial<ManualEntry>) => {
    setTemplate(tmpl);
    setEditingEntry(null);
    setMode("create");
  };

  const handleEdit = (entry: ManualEntry) => {
    setEditingEntry(entry);
    setTemplate(undefined);
    setMode("edit");
  };

  const handleSave = async (entry: ManualEntry) => {
    if (mode === "edit") {
      await updateEntry(entry.id, entry);
    } else {
      await addEntry(entry);
    }
    setMode("list");
    setEditingEntry(null);
    setTemplate(undefined);
  };

  const handleDelete = (entry: ManualEntry) => {
    Alert.alert(
      "Delete Entry",
      `Delete "${entry.asset}" ${entry.type} entry?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteEntry(entry.id),
        },
      ]
    );
  };

  const handleCancel = () => {
    setMode("list");
    setEditingEntry(null);
    setTemplate(undefined);
  };

  // Show form for create/edit
  if (mode === "create" || mode === "edit") {
    return (
      <ManualEntryForm
        initialValues={mode === "edit" ? editingEntry ?? undefined : template}
        onSave={handleSave}
        onCancel={handleCancel}
        isEditing={mode === "edit"}
      />
    );
  }

  // List mode
  return (
    <View style={styles.container}>
      {/* Action Buttons */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => handleCreate()}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.text} />
          <Text style={styles.addBtnText}>New Entry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.templateBtn}
          onPress={() => handleCreate(BLUR_LIQUIDATION_TEMPLATE)}
        >
          <Ionicons name="flash-outline" size={18} color={colors.warning} />
          <Text style={styles.templateBtnText}>Quick Add Liquidation</Text>
        </TouchableOpacity>
      </View>

      {entries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="create-outline" size={64} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Manual Entries</Text>
          <Text style={styles.emptySubtitle}>
            Add custom transactions that don't appear via API — like the Blur
            NFT liquidation loss.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <EntryCard
              entry={item}
              onEdit={() => handleEdit(item)}
              onDelete={() => handleDelete(item)}
            />
          )}
        />
      )}
    </View>
  );
}

function EntryCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: ManualEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const typeColor =
    entry.type === "liquidation"
      ? colors.danger
      : entry.type === "buy"
        ? colors.success
        : entry.type === "sell"
          ? colors.danger
          : colors.primaryLight;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardAsset}>{entry.asset}</Text>
          <View
            style={[styles.typeBadge, { backgroundColor: typeColor + "20" }]}
          >
            <Text style={[styles.typeBadgeText, { color: typeColor }]}>
              {entry.type.toUpperCase()}
            </Text>
          </View>
          <View style={styles.customBadge}>
            <Text style={styles.customBadgeText}>Custom</Text>
          </View>
        </View>
        <Text style={styles.cardDate}>{formatDate(entry.date)}</Text>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Amount</Text>
          <Text style={styles.cardValue}>
            {entry.amount} {entry.asset}
          </Text>
        </View>
        {entry.totalValueUsd > 0 && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Value</Text>
            <Text style={styles.cardValue}>
              {formatUsd(entry.totalValueUsd)}
            </Text>
          </View>
        )}
        {entry.gainLossUsd != null && entry.gainLossUsd !== 0 && (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Gain/Loss</Text>
            <Text
              style={[
                styles.cardValue,
                {
                  color:
                    entry.gainLossUsd >= 0 ? colors.success : colors.danger,
                },
              ]}
            >
              {entry.gainLossUsd >= 0 ? "+" : ""}
              {formatUsd(entry.gainLossUsd)}
            </Text>
          </View>
        )}
        {entry.notes && (
          <Text style={styles.cardNotes}>{entry.notes}</Text>
        )}
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
          <Ionicons name="pencil-outline" size={16} color={colors.primaryLight} />
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
          <Text style={styles.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  actionBar: {
    flexDirection: "row",
    padding: spacing.md,
    gap: spacing.sm,
  },
  addBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  addBtnText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  templateBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.warning + "15",
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.warning + "40",
    gap: spacing.xs,
  },
  templateBtnText: {
    color: colors.warning,
    fontSize: fontSize.sm,
    fontWeight: "600",
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
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardHeader: {
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  cardAsset: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: "600",
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 10,
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
    fontSize: 10,
    fontWeight: "700",
    color: colors.warning,
    letterSpacing: 0.5,
  },
  cardDate: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  cardBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  cardLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  cardValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: "500",
  },
  cardNotes: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    marginTop: spacing.xs,
  },
  cardActions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  editBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  editBtnText: {
    color: colors.primaryLight,
    fontSize: fontSize.sm,
    fontWeight: "500",
  },
  deleteBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  deleteBtnText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontWeight: "500",
  },
});
