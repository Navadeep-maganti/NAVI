import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Location from "expo-location";
import { apiClient } from "../config/api";
import { useAuthStore } from "../store/authStore";
import { MonitoringPreset, useSafetyStore } from "../store/safetyStore";
import { colors } from "../theme/colors";

const SENSITIVITY_OPTIONS = [
  { label: "Low (0.4)", value: 0.4 },
  { label: "Balanced (0.7)", value: 0.7 },
  { label: "High (1.0)", value: 1.0 },
];

const RETENTION_OPTIONS = [7, 30, 90];

export const SettingsScreen: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { monitoringPreset, setMonitoringPreset, refreshDashboard } = useSafetyStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fgPerm, setFgPerm] = useState<string>("unknown");
  const [bgPerm, setBgPerm] = useState<string>("unknown");
  const [trackingConsent, setTrackingConsent] = useState(true);
  const [retentionDays, setRetentionDays] = useState(30);

  const [lateNightHour, setLateNightHour] = useState("23");
  const [unknownAreaAlerts, setUnknownAreaAlerts] = useState(true);
  const [autoAlertContacts, setAutoAlertContacts] = useState(true);
  const [sensitivity, setSensitivity] = useState(0.7);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  const loadSettings = async () => {
    try {
      const [fg, bg, prefRes, privRes] = await Promise.allSettled([
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
        apiClient.get("/api/preferences"),
        apiClient.get("/api/privacy"),
      ]);

      if (fg.status === "fulfilled") setFgPerm(fg.value.status);
      if (bg.status === "fulfilled") setBgPerm(bg.value.status);
      if (prefRes.status === "fulfilled" && prefRes.value.data?.preferences) {
        const p = prefRes.value.data.preferences;
        setLateNightHour(String(p.lateNightThreshold ?? 23));
        setUnknownAreaAlerts(p.enableUnknownAreaAlerts ?? true);
        setAutoAlertContacts(p.autoAlertTrustedContacts ?? true);
        setSensitivity(p.deviationSensitivity ?? 0.7);
      }
      if (privRes.status === "fulfilled" && privRes.value.data?.privacy) {
        const pr = privRes.value.data.privacy;
        setTrackingConsent(pr.locationTrackingConsent ?? true);
        setRetentionDays(pr.dataRetentionDays ?? 30);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSavePreferences = async () => {
    setSaving(true);
    try {
      const hour = Math.max(18, Math.min(23, Number(lateNightHour) || 23));
      await apiClient.post("/api/preferences", {
        lateNightThreshold: hour,
        enableUnknownAreaAlerts: unknownAreaAlerts,
        autoAlertTrustedContacts: autoAlertContacts,
        deviationSensitivity: sensitivity,
      });
      Alert.alert("Saved", "Monitoring preferences and alert sensitivity updated.");
    } catch {
      Alert.alert("Error", "Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleConsent = async (value: boolean) => {
    setTrackingConsent(value);
    try {
      await apiClient.patch("/api/privacy/consent", { locationTrackingConsent: value });
    } catch {
      setTrackingConsent(!value);
    }
  };

  const handleSetRetention = async (days: number) => {
    setRetentionDays(days);
    try {
      await apiClient.patch("/api/privacy/consent", { dataRetentionDays: days });
    } catch {
      // Keep UI responsive.
    }
  };

  const handlePurgeData = () => {
    Alert.alert(
      "Erase All Location Data?",
      "This permanently deletes your stored GPS history, learned behavior profile, live shares, and alert logs.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Erase Everything",
          style: "destructive",
          onPress: async () => {
            try {
              const { data } = await apiClient.delete("/api/privacy/location-data");
              await refreshDashboard(true);
              Alert.alert(
                "Data Erased",
                `Removed ${data.deleted?.locations ?? 0} locations and ${data.deleted?.behaviorProfiles ?? 0} profile(s).`
              );
            } catch {
              Alert.alert("Error", "Could not erase location data.");
            }
          },
        },
      ]
    );
  };

  const handleChangePassword = async () => {
    if (!currentPassword || newPassword.length < 6) {
      Alert.alert("Invalid Input", "Enter current password and a new password (min 6 chars).");
      return;
    }
    setChangingPw(true);
    try {
      await apiClient.post("/api/auth/change-password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      Alert.alert("Updated", "Your password has been changed.");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Could not update password.";
      Alert.alert("Error", msg);
    } finally {
      setChangingPw(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Settings &amp; Privacy</Text>
      <Text style={styles.sub}>Control permissions, sensitivity, data retention, and account security</Text>

      {/* 1. Location Permissions */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>LOCATION PERMISSIONS</Text>
        <Text style={styles.meta}>
          Foreground: {fgPerm.toUpperCase()} • Background: {bgPerm.toUpperCase()}
        </Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Allow NAVI location tracking</Text>
          <Switch value={trackingConsent} onValueChange={handleToggleConsent} />
        </View>
        <TouchableOpacity style={styles.outlineBtn} onPress={() => Linking.openSettings()}>
          <Text style={styles.outlineBtnText}>Open Device Permission Settings</Text>
        </TouchableOpacity>
      </View>

      {/* 2. Monitoring Preferences & 3. Alert Sensitivity */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>MONITORING PREFERENCES &amp; SENSITIVITY</Text>

        <Text style={styles.fieldLabel}>GPS Interval Preset</Text>
        <View style={styles.chipRow}>
          {(["high", "balanced", "saver"] as MonitoringPreset[]).map((preset) => (
            <TouchableOpacity
              key={preset}
              style={[styles.chip, monitoringPreset === preset && styles.chipActive]}
              onPress={() => setMonitoringPreset(preset)}
            >
              <Text style={[styles.chipText, monitoringPreset === preset && styles.chipTextActive]}>
                {preset === "high" ? "5s High" : preset === "balanced" ? "15s Balanced" : "60s Saver"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Alert Sensitivity</Text>
        <View style={styles.chipRow}>
          {SENSITIVITY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.chip, Math.abs(sensitivity - opt.value) < 0.05 && styles.chipActive]}
              onPress={() => setSensitivity(opt.value)}
            >
              <Text
                style={[
                  styles.chipText,
                  Math.abs(sensitivity - opt.value) < 0.05 && styles.chipTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Late-Night Threshold Hour (18–23)</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={lateNightHour}
          onChangeText={setLateNightHour}
        />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Alert on unfamiliar areas</Text>
          <Switch value={unknownAreaAlerts} onValueChange={setUnknownAreaAlerts} />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Auto-notify contacts on timeout</Text>
          <Switch value={autoAlertContacts} onValueChange={setAutoAlertContacts} />
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={handleSavePreferences} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.primaryBtnText}>Save Monitoring Settings</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* 4. Data Management */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>DATA MANAGEMENT</Text>
        <Text style={styles.fieldLabel}>Location History Retention</Text>
        <View style={styles.chipRow}>
          {RETENTION_OPTIONS.map((days) => (
            <TouchableOpacity
              key={days}
              style={[styles.chip, retentionDays === days && styles.chipActive]}
              onPress={() => handleSetRetention(days)}
            >
              <Text style={[styles.chipText, retentionDays === days && styles.chipTextActive]}>
                {days} days
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.dangerOutlineBtn} onPress={handlePurgeData}>
          <Text style={styles.dangerOutlineText}>Erase All Location &amp; Profile Data</Text>
        </TouchableOpacity>
      </View>

      {/* 5. Account & Security Settings */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>ACCOUNT &amp; SECURITY</Text>
        <Text style={styles.meta}>
          Signed in as {user?.name || "User"} ({user?.email || ""})
        </Text>

        <TextInput
          style={[styles.input, { marginTop: 12 }]}
          placeholder="Current Password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={currentPassword}
          onChangeText={setCurrentPassword}
        />
        <TextInput
          style={styles.input}
          placeholder="New Password (min 6 chars)"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
        />

        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={handleChangePassword}
          disabled={changingPw}
        >
          {changingPw ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.outlineBtnText}>Update Password</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 24, paddingBottom: 40, gap: 14 },
  heading: { fontSize: 22, fontWeight: "800", color: colors.text },
  sub: { color: colors.muted, fontSize: 13, marginBottom: 4 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  cardLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: "600", marginTop: 10, marginBottom: 6 },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  switchLabel: { color: colors.text, fontSize: 14, flex: 1, paddingRight: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: colors.bg, fontWeight: "700" },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    color: colors.text,
    marginBottom: 10,
  },
  primaryBtn: {
    marginTop: 10,
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.bg, fontSize: 15, fontWeight: "700" },
  outlineBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
  },
  outlineBtnText: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  dangerOutlineBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
  },
  dangerOutlineText: { color: colors.danger, fontSize: 14, fontWeight: "700" },
  logoutBtn: {
    marginTop: 12,
    backgroundColor: colors.danger,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  logoutText: { color: colors.text, fontSize: 15, fontWeight: "700" },
});
