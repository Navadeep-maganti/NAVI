import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Location from "expo-location";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiClient } from "../config/api";
import { colors } from "../theme/colors";
import { OnboardingStackParamList } from "../navigation/types";

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, "LocationPermission">;
};

export const LocationPermissionScreen: React.FC<Props> = ({ navigation }) => {
  const [requesting, setRequesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleEnableLocation = async () => {
    setRequesting(true);
    setStatusMessage(null);
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== "granted") {
        setStatusMessage("Foreground location was denied. You can enable it later in Settings.");
        await apiClient.patch("/api/privacy/consent", { locationTrackingConsent: false });
        setRequesting(false);
        return;
      }

      const bg = await Location.requestBackgroundPermissionsAsync();
      await apiClient.patch("/api/privacy/consent", { locationTrackingConsent: true });

      if (bg.status !== "granted") {
        setStatusMessage(
          "Foreground location enabled. Note: Background ('Always Allow') requires an Expo Dev Build and permission in Settings."
        );
      } else {
        navigation.navigate("NotificationPermission");
      }
    } catch {
      setStatusMessage("Location permission request could not complete on this device/simulator.");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.step}>Step 2 of 3</Text>
      <Text style={styles.title}>Location Access & Privacy</Text>
      <Text style={styles.subtitle}>
        Why NAVI asks for foreground &amp; background location:
      </Text>

      <View style={styles.card}>
        <Text style={styles.bullet}>• Learns your regular safe places &amp; routine routes privately.</Text>
        <Text style={styles.bullet}>• Checks nearby area-safety risk even when your phone is in your pocket.</Text>
        <Text style={styles.bullet}>• Shares live GPS updates with trusted contacts only during emergencies or active shares.</Text>
        <Text style={styles.bullet}>• You can withdraw consent or erase all history anytime in Privacy settings.</Text>
      </View>

      {statusMessage && (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>{statusMessage}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.primaryBtn} onPress={handleEnableLocation} disabled={requesting}>
        {requesting ? (
          <ActivityIndicator color={colors.bg} />
        ) : (
          <Text style={styles.primaryBtnText}>Allow Location Access</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.skipBtn}
        onPress={() => navigation.navigate("NotificationPermission")}
      >
        <Text style={styles.skipText}>Continue to Notifications</Text>
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
    backgroundColor: "#172554",
    borderColor: colors.primary,
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  infoText: { color: "#BAE6FD", fontSize: 13, lineHeight: 18 },
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
