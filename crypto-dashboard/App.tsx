import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useSettingsStore } from "./src/stores/settings";
import { useManualEntriesStore } from "./src/stores/manual-entries";
import DashboardScreen from "./src/app/DashboardScreen";
import TradesScreen from "./src/app/TradesScreen";
import ManualEntryScreen from "./src/app/ManualEntryScreen";
import SettingsScreen from "./src/app/SettingsScreen";
import { colors } from "./src/utils/theme";

const Tab = createBottomTabNavigator();

const AppTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

const TAB_ICONS: Record<string, { focused: string; unfocused: string }> = {
  Dashboard: { focused: "pie-chart", unfocused: "pie-chart-outline" },
  Trades: { focused: "swap-horizontal", unfocused: "swap-horizontal-outline" },
  "Manual Entry": { focused: "create", unfocused: "create-outline" },
  Settings: { focused: "settings", unfocused: "settings-outline" },
};

export default function App() {
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const hydrateManualEntries = useManualEntriesStore((s) => s.hydrate);

  useEffect(() => {
    hydrateSettings();
    hydrateManualEntries();
  }, []);

  return (
    <NavigationContainer theme={AppTheme}>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            const icons = TAB_ICONS[route.name];
            const iconName = focused ? icons.focused : icons.unfocused;
            return <Ionicons name={iconName as any} size={size} color={color} />;
          },
          tabBarActiveTintColor: colors.primaryLight,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            paddingBottom: 4,
            height: 56,
          },
          headerStyle: {
            backgroundColor: colors.surface,
            shadowColor: "transparent",
            elevation: 0,
          },
          headerTintColor: colors.text,
          headerTitleStyle: {
            fontWeight: "600",
          },
        })}
      >
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="Trades" component={TradesScreen} />
        <Tab.Screen name="Manual Entry" component={ManualEntryScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
