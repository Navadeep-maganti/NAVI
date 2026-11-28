import React, { useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Notifications from "expo-notifications";
import { apiClient } from "../config/api";
import { useAuthStore } from "../store/authStore";
import { colors } from "../theme/colors";

export const NotificationPermissionScreen: React.FC = () => {
  const { completeOnboarding } = useAuthStore();
  const [requesting, setRequesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleEnableNotifications = async () => {
    setRequesting(true);
    setStatusMessage(null);
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") {
        setStatusMessage("Notifications denied. Check-in prompts won't wake your screen when backgrounded.");
        setRequesting(false);
        return;
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("navi-safety", {
          name: "NAVI Safety Check-Ins",
          importance: Notifications.AndroidImportance.MAX,
        });
      }

      try {
        const tokenResp = await Notifications.getDevicePushTokenAsync();
        const deviceToken = typeof tokenResp.data === "string" ? tokenResp.data : JSON.stringify(tokenResp.data);
        if (deviceToken) {
          await apiClient.post("/api/auth/device-token", {
            fcmToken: deviceToken,
            platform: Platform.OS === "ios" ? "ios" : "android",
          });
        }
      } catch {
        // Native FCM device tokens require an Expo Dev Build / standalone binary.
      }

      await completeOnboarding();
    } catch {
      await completeOnboarding();
    } finally {
      setRequesting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.step}>Step 3 of 3</Text>
      <Text style={styles.title}>Safety Check-In Alerts</Text>
      <Text style={styles.subtitle}>
        Why NAVI needs notification permissions:
      </Text>

      <View style={styles.card}>
        <Text style={styles.bullet}>• Sends a quick "Are you okay?" check-in when unusual risk is detected.</Text>
        <Text style={styles.bullet}>• Lets you tap "I'm Safe" before any alert is sent to your trusted contacts.</Text>
        <Text style={styles.bullet}>• Confirms when an active Safe Session or Live Share is running.</Text>
      </View>

      {statusMessage && (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>{statusMessage}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.primaryBtn} onPress={handleEnableNotifications} disabled={requesting}>
        {requesting ? (
          <ActivityIndicator color={colors.bg} />
        ) : (
          <Text style={styles.primaryBtnText}>Enable Notifications &amp; Finish</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.skipBtn} onPress={completeOnboarding}>
        <Text style={styles.skipText}>Skip for now</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: "center" },
  step: { color: colors.primary, fontSize: 13, fontWeight: "700", marginBottom: 6 },
  title: { fontSize: 26, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 6, marginBottom: 20 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    gap: 12,
    marginBottom: 20,
  },
  bullet: { color: colors.text, fontSize: 14, lineHeight: 20 },
  infoBox: {
    backgroundColor: "#3B151A",
    borderColor: colors.danger,
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  infoText: { color: "#FCA5A5", fontSize: 13 },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.bg, fontSize: 16, fontWeight: "700" },
  skipBtn: { marginTop: 16, alignItems: "center", paddingVertical: 10 },
  skipText: { color: colors.muted, fontSize: 14, fontWeight: "600" },
});
