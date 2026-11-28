import React, { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiClient } from "../config/api";
import { useAuthStore } from "../store/authStore";
import { colors } from "../theme/colors";
import { OnboardingStackParamList } from "../navigation/types";

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, "ProfileSetup">;
};

export const ProfileSetupScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuthStore();
  const [lateNightHour, setLateNightHour] = useState("23");
  const [unknownAreaAlerts, setUnknownAreaAlerts] = useState(true);
  const [autoAlertContacts, setAutoAlertContacts] = useState(true);

  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [relationship, setRelationship] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    setSaving(true);
    setError(null);
    try {
      const hour = Math.max(18, Math.min(23, Number(lateNightHour) || 23));
      await apiClient.post("/api/preferences", {
        lateNightThreshold: hour,
        enableUnknownAreaAlerts: unknownAreaAlerts,
        autoAlertTrustedContacts: autoAlertContacts,
        deviationSensitivity: 0.7,
      });

      if (contactName.trim() && contactPhone.trim()) {
        await apiClient.post("/api/contacts", {
          name: contactName.trim(),
          phone: contactPhone.trim(),
          email: contactEmail.trim(),
          relationship: relationship.trim(),
        });
      }
      navigation.navigate("LocationPermission");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Could not save profile setup. Please try again.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.step}>Step 1 of 3</Text>
      <Text style={styles.title}>Safety Profile Setup</Text>
      <Text style={styles.subtitle}>
        Hi {user?.name || "there"}, configure your alert preferences and an emergency contact.
      </Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Safety Preferences</Text>

        <Text style={styles.label}>Late-night alert hour (18–23)</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={lateNightHour}
          onChangeText={setLateNightHour}
        />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Alert on unfamiliar high-risk areas</Text>
          <Switch value={unknownAreaAlerts} onValueChange={setUnknownAreaAlerts} />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Auto-notify contacts if check-in times out</Text>
          <Switch value={autoAlertContacts} onValueChange={setAutoAlertContacts} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>First Trusted Contact (Optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Contact Name"
          placeholderTextColor={colors.muted}
          value={contactName}
          onChangeText={setContactName}
        />
        <TextInput
          style={styles.input}
          placeholder="Phone Number"
          placeholderTextColor={colors.muted}
          keyboardType="phone-pad"
          value={contactPhone}
          onChangeText={setContactPhone}
        />
        <TextInput
          style={styles.input}
          placeholder="Email (for instant emergency map links)"
          placeholderTextColor={colors.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          value={contactEmail}
          onChangeText={setContactEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Relationship (e.g. Parent, Friend)"
          placeholderTextColor={colors.muted}
          value={relationship}
          onChangeText={setRelationship}
        />
      </View>

      <TouchableOpacity style={styles.btn} onPress={handleContinue} disabled={saving}>
        {saving ? (
          <ActivityIndicator color={colors.bg} />
        ) : (
          <Text style={styles.btnText}>Save & Continue</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingTop: 56, paddingBottom: 40 },
  step: { color: colors.primary, fontSize: 13, fontWeight: "700", marginBottom: 6 },
  title: { fontSize: 26, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: 20 },
  errorBox: {
    backgroundColor: "#3B151A",
    borderColor: colors.danger,
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorText: { color: "#FCA5A5", fontSize: 13 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 12 },
  label: { color: colors.muted, fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    color: colors.text,
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  switchLabel: { color: colors.text, fontSize: 14, flex: 1, paddingRight: 12 },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  btnText: { color: colors.bg, fontSize: 16, fontWeight: "700" },
});
