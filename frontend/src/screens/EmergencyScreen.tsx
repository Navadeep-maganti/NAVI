import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { apiClient } from "../config/api";
import { useSafetyStore } from "../store/safetyStore";
import { colors } from "../theme/colors";

interface NotifiedContact {
  name: string;
  phone?: string;
  email?: string;
  channel: string;
  status: "dispatched" | "logged_local" | "failed";
  detail?: string;
}

interface SafetyAlertRecord {
  _id: string;
  type: "checkin" | "manual_sos" | "escalated_emergency";
  status: "pending_checkin" | "resolved_safe" | "escalated" | "cancelled";
  triggerReason: string;
  createdAt: string;
  escalatedAt?: string;
  checkinDeadline?: string;
  notes?: string;
  notifiedContacts?: NotifiedContact[];
}

const STATUS_COLORS: Record<string, string> = {
  pending_checkin: colors.warning,
  escalated: colors.danger,
  resolved_safe: colors.success,
  cancelled: colors.muted,
};

export const EmergencyScreen: React.FC = () => {
  const { pendingCheckin, sosLoading, triggerSOS, respondToCheckin } = useSafetyStore();
  const [alerts, setAlerts] = useState<SafetyAlertRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sosNote, setSosNote] = useState("");

  const loadAlerts = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const { data } = await apiClient.get("/api/alerts", { params: { limit: 30 } });
      setAlerts(data.alerts || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  const handleSOS = () => {
    Alert.alert(
      "Activate Emergency SOS?",
      "This will immediately notify your trusted contacts and start a live location share.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send SOS",
          style: "destructive",
          onPress: async () => {
            await triggerSOS(sosNote.trim() || "Manual SOS from Alerts tab");
            setSosNote("");
            await loadAlerts();
          },
        },
      ]
    );
  };

  const handleResolve = async (alertId: string) => {
    try {
      await apiClient.post(`/api/alerts/${alertId}/resolve`);
      await loadAlerts();
    } catch {
      Alert.alert("Error", "Could not resolve emergency alert.");
    }
  };

  const activeEscalation = alerts.find((a) => a.status === "escalated");

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => loadAlerts(true)} tintColor={colors.primary} />
      }
    >
      <Text style={styles.heading}>Alerts &amp; Emergency</Text>
      <Text style={styles.sub}>Safety check-ins, SOS activation, and contact delivery status</Text>

      {/* 1. Active Pending Check-In */}
      {pendingCheckin && (
        <View style={styles.checkinCard}>
          <Text style={styles.checkinTitle}>Pending Safety Check-In</Text>
          <Text style={styles.checkinSub}>
            Risk level: {pendingCheckin.contextualRiskLevel.toUpperCase()} • Respond before{" "}
            {new Date(pendingCheckin.checkinDeadline).toLocaleTimeString()}
          </Text>
          <View style={styles.rowGap}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.success }]}
              onPress={async () => {
                await respondToCheckin("safe");
                await loadAlerts();
              }}
            >
              <Text style={styles.actionText}>I&apos;m Safe</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.danger }]}
              onPress={async () => {
                await respondToCheckin("need_help");
                await loadAlerts();
              }}
            >
              <Text style={styles.actionText}>Need Help</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 2. Active Emergency Escalation & Contact Notification Status */}
      {activeEscalation && (
        <View style={styles.escalatedCard}>
          <Text style={styles.escalatedBadge}>EMERGENCY ESCALATED</Text>
          <Text style={styles.escalatedTitle}>
            Trigger: {activeEscalation.triggerReason.replace(/_/g, " ")}
          </Text>
          <Text style={styles.meta}>
            Escalated at{" "}
            {new Date(activeEscalation.escalatedAt || activeEscalation.createdAt).toLocaleString()}
          </Text>

          <Text style={styles.subLabel}>CONTACT NOTIFICATION STATUS</Text>
          {!activeEscalation.notifiedContacts?.length ? (
            <Text style={styles.meta}>No active emergency contacts configured.</Text>
          ) : (
            activeEscalation.notifiedContacts.map((nc, idx) => (
              <View key={`${nc.name}-${idx}`} style={styles.contactRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactName}>{nc.name}</Text>
                  <Text style={styles.meta}>
                    {nc.channel} • {nc.detail || nc.status}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.statusTag,
                    {
                      color:
                        nc.status === "dispatched"
                          ? colors.success
                          : nc.status === "failed"
                          ? colors.danger
                          : colors.warning,
                    },
                  ]}
                >
                  {nc.status.toUpperCase()}
                </Text>
              </View>
            ))
          )}

          <TouchableOpacity
            style={styles.resolveBtn}
            onPress={() => handleResolve(activeEscalation._id)}
          >
            <Text style={styles.resolveBtnText}>I&apos;m Safe Now — Resolve Emergency</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 3. Manual SOS Activation */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>SOS ACTIVATION</Text>
        <TextInput
          style={styles.input}
          placeholder="Optional emergency note (e.g. Need pickup)"
          placeholderTextColor={colors.muted}
          value={sosNote}
          onChangeText={setSosNote}
        />
        <TouchableOpacity
          style={[styles.sosBtn, sosLoading && { opacity: 0.7 }]}
          onPress={handleSOS}
          disabled={sosLoading}
        >
          {sosLoading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.sosBtnText}>ACTIVATE SOS EMERGENCY</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* 4. Emergency History */}
      <Text style={styles.historyTitle}>Emergency History</Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : alerts.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.meta}>No safety alerts or emergencies recorded yet.</Text>
        </View>
      ) : (
        alerts.map((a) => (
          <View key={a._id} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.historyType}>
                {a.type.replace(/_/g, " ").toUpperCase()}
              </Text>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: STATUS_COLORS[a.status] || colors.muted },
                ]}
              >
                <Text style={styles.badgeText}>{a.status.replace(/_/g, " ").toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.meta}>
              Reason: {a.triggerReason} • {new Date(a.createdAt).toLocaleString()}
            </Text>
            {a.notifiedContacts && a.notifiedContacts.length > 0 && (
              <Text style={styles.meta}>
                Contacts notified: {a.notifiedContacts.length} (
                {a.notifiedContacts.filter((c) => c.status === "dispatched").length} dispatched)
              </Text>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 52, paddingBottom: 36, gap: 12 },
  heading: { fontSize: 22, fontWeight: "800", color: colors.text },
  sub: { color: colors.muted, fontSize: 13, marginBottom: 4 },
  checkinCard: {
    backgroundColor: "#451A03",
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  checkinTitle: { color: "#FDE68A", fontSize: 16, fontWeight: "800" },
  checkinSub: { color: "#FCD34D", fontSize: 13, marginTop: 4, marginBottom: 12 },
  rowGap: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: "center" },
  actionText: { color: colors.text, fontWeight: "700", fontSize: 14 },
  escalatedCard: {
    backgroundColor: "#3B0A0A",
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  escalatedBadge: { color: "#FCA5A5", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  escalatedTitle: { color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 4 },
  subLabel: { color: "#FCA5A5", fontSize: 11, fontWeight: "700", marginTop: 12, marginBottom: 6 },
  contactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#5B1B1B",
  },
  contactName: { color: colors.text, fontSize: 14, fontWeight: "700" },
  statusTag: { fontSize: 11, fontWeight: "800" },
  resolveBtn: {
    marginTop: 14,
    backgroundColor: colors.success,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  resolveBtnText: { color: "#0B1220", fontWeight: "800", fontSize: 14 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  cardLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 10 },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    color: colors.text,
    marginBottom: 12,
  },
  sosBtn: { backgroundColor: colors.danger, borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  sosBtnText: { color: colors.text, fontSize: 15, fontWeight: "900", letterSpacing: 1 },
  historyTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 6 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  historyType: { color: colors.text, fontSize: 14, fontWeight: "800" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { color: "#0B1220", fontSize: 10, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
