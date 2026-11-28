import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

type IconName = "home" | "map" | "session" | "insights" | "alert" | "contacts" | "settings" | "shield" | "location" | "bell" | "arrow";

const glyphs: Record<IconName, string> = {
  home: "⌂",
  map: "◉",
  session: "◷",
  insights: "⌁",
  alert: "!",
  contacts: "♧",
  settings: "⚙",
  shield: "◆",
  location: "⌖",
  bell: "●",
  arrow: "›",
};

export const AppIcon: React.FC<{ name: IconName; active?: boolean; size?: number }> = ({ name, active, size = 19 }) => (
  <View style={[styles.wrap, active && styles.active]}>
    <Text style={[styles.icon, { fontSize: size }, active && styles.activeIcon]}>{glyphs[name]}</Text>
  </View>
);

const styles = StyleSheet.create({
  wrap: { width: 28, height: 25, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  active: { backgroundColor: colors.primarySoft },
  icon: { color: colors.muted, fontWeight: "800", lineHeight: 22 },
  activeIcon: { color: colors.primary },
});
