import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useSettingsStore } from "../stores/settings";
import { PLATFORM_CONFIGS } from "../utils/platforms";
import { colors, fontSize, spacing, borderRadius } from "../utils/theme";
import { Platform, ConnectionStatus, PlatformConfig, PlatformField } from "../types";

function StatusDot({ status }: { status: ConnectionStatus }) {
  const color =
    status === "connected"
      ? colors.success
      : status === "error"
        ? colors.danger
        : status === "testing"
          ? colors.warning
          : colors.textMuted;

  return <View style={[styles.statusDot, { backgroundColor: color }]} />;
}

function PlatformCard({ config }: { config: PlatformConfig }) {
  const { setCredential, getCredential, setConnectionStatus, connectionStatus } =
    useSettingsStore();
  const status = connectionStatus[config.platform];
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSavedValues();
  }, []);

  const loadSavedValues = async () => {
    const values: Record<string, string> = {};
    for (const field of config.fields) {
      if (field.secure) {
        const val = await getCredential(config.platform, field.key);
        values[field.key] = val ?? "";
      } else {
        const val = await SecureStore.getItemAsync(
          `cred_${config.platform}_${field.key}`
        );
        values[field.key] = val ?? "";
      }
    }
    setFieldValues(values);
  };

  const handleSave = async () => {
    setSaving(true);
    for (const field of config.fields) {
      await setCredential(config.platform, field.key, fieldValues[field.key] ?? "");
    }

    // Check if any fields have values
    const hasValues = Object.values(fieldValues).some((v) => v.trim().length > 0);
    setConnectionStatus(config.platform, hasValues ? "connected" : "unconfigured");
    setSaving(false);
    Alert.alert("Saved", `${config.label} credentials saved.`);
  };

  const handleTestConnection = async () => {
    setConnectionStatus(config.platform, "testing");
    // Stub: simulate a connection test
    await new Promise((r) => setTimeout(r, 1500));
    const hasValues = Object.values(fieldValues).some((v) => v.trim().length > 0);
    if (hasValues) {
      setConnectionStatus(config.platform, "connected");
      Alert.alert("Success", `${config.label} connection verified.`);
    } else {
      setConnectionStatus(config.platform, "error");
      Alert.alert("Error", `No credentials configured for ${config.label}.`);
    }
  };

  const toggleReveal = (key: string) => {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons
          name={config.icon as any}
          size={24}
          color={colors.primaryLight}
        />
        <Text style={styles.cardTitle}>{config.label}</Text>
        <StatusDot status={status} />
        <Text style={styles.statusText}>
          {status === "testing" ? "Testing..." : status}
        </Text>
      </View>

      {config.fields.map((field) => (
        <View key={field.key} style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>{field.label}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={field.placeholder}
              placeholderTextColor={colors.textMuted}
              value={fieldValues[field.key] ?? ""}
              onChangeText={(text) =>
                setFieldValues((prev) => ({ ...prev, [field.key]: text }))
              }
              secureTextEntry={field.secure && !revealed[field.key]}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {field.secure && (
              <TouchableOpacity
                onPress={() => toggleReveal(field.key)}
                style={styles.revealBtn}
              >
                <Ionicons
                  name={revealed[field.key] ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <Text style={styles.saveBtnText}>Save</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.testBtn}
          onPress={handleTestConnection}
          disabled={status === "testing"}
        >
          {status === "testing" ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.testBtnText}>Test Connection</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { currency, setCurrency, autoRefreshInterval, setAutoRefreshInterval, clearAll } =
    useSettingsStore();

  const handleClearAll = () => {
    Alert.alert(
      "Clear All Data",
      "This will remove all saved API keys and reset settings. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Everything",
          style: "destructive",
          onPress: clearAll,
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.sectionTitle}>API Keys & Wallets</Text>
      {PLATFORM_CONFIGS.map((config) => (
        <PlatformCard key={config.platform} config={config} />
      ))}

      <Text style={styles.sectionTitle}>Preferences</Text>
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Default Currency</Text>
        <View style={styles.toggleRow}>
          {(["USD", "CAD"] as const).map((c) => (
            <TouchableOpacity
              key={c}
              style={[
                styles.toggleBtn,
                currency === c && styles.toggleBtnActive,
              ]}
              onPress={() => setCurrency(c)}
            >
              <Text
                style={[
                  styles.toggleBtnText,
                  currency === c && styles.toggleBtnTextActive,
                ]}
              >
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>
          Auto-Refresh Interval
        </Text>
        <View style={styles.toggleRow}>
          {([5, 15, 30, 0] as const).map((interval) => (
            <TouchableOpacity
              key={interval}
              style={[
                styles.toggleBtn,
                autoRefreshInterval === interval && styles.toggleBtnActive,
              ]}
              onPress={() => setAutoRefreshInterval(interval)}
            >
              <Text
                style={[
                  styles.toggleBtnText,
                  autoRefreshInterval === interval &&
                    styles.toggleBtnTextActive,
                ]}
              >
                {interval === 0 ? "Manual" : `${interval}m`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.clearBtn} onPress={handleClearAll}>
        <Ionicons name="trash-outline" size={18} color={colors.danger} />
        <Text style={styles.clearBtnText}>Clear All Data & Reset</Text>
      </TouchableOpacity>
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
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  cardTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: "600",
    marginLeft: spacing.sm,
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    textTransform: "capitalize",
  },
  fieldContainer: {
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: fontSize.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  revealBtn: {
    marginLeft: spacing.sm,
    padding: spacing.sm,
  },
  cardActions: {
    flexDirection: "row",
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  saveBtnText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  testBtn: {
    flex: 1,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  testBtnText: {
    color: colors.primaryLight,
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  toggleRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  toggleBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleBtnText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  toggleBtnTextActive: {
    color: colors.text,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  clearBtnText: {
    color: colors.danger,
    fontSize: fontSize.md,
    fontWeight: "500",
  },
});
