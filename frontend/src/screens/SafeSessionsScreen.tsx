import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafetyStore } from "../store/safetyStore";
import { colors } from "../theme/colors";

const ACTIVITIES = [
  "commute",
  "jogging",
  "cycling",
  "night_shift",
  "traveling",
  "social_event",
];

const DURATIONS = [30, 60, 120, 240];

export const SafeSessionsScreen: React.FC = () => {
  const {
    activeSession,
    historyLocations,
    startSafeSession,
    endSafeSession,
    fetchHistory,
    refreshDashboard,
  } = useSafetyStore();

  const [activity, setActivity] = useState("commute");
  const [duration, setDuration] = useState(60);
  const [label, setLabel] = useState("");
  const [hoursFilter, setHoursFilter] = useState(24);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    refreshDashboard(true);
    fetchHistory(hoursFilter);
  }, [hoursFilter]);

  const handleStart = async () => {
    setSubmitting(true);
    await startSafeSession({
      activityType: activity,
      label: label.trim() || undefined,
      durationMinutes: duration,
    });
    setLabel("");
    setSubmitting(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Safe Sessions</Text>
      <Text style={styles.sub}>
        Declare an activity so expected speed, hours, or routes don&apos;t trigger false alerts.
      </Text>

      {activeSession ? (
        <View style={styles.activeCard}>
          <Text style={styles.activeBadge}>ACTIVE SESSION</Text>
          <Text style={styles.activeTitle}>
            {activeSession.activityType.replace("_", " ").toUpperCase()}
            {activeSession.label ? ` — ${activeSession.label}` : ""}
          </Text>
          <Text style={styles.meta}>
            Ends at {new Date(activeSession.endsAt).toLocaleTimeString()}
          </Text>
          <TouchableOpacity
            style={styles.endBtn}
            onPress={() => endSafeSession(activeSession._id)}
          >
            <Text style={styles.endBtnText}>End Safe Session</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Start a Declared Activity</Text>
          <View style={styles.chipWrap}>
            {ACTIVITIES.map((act) => (
              <TouchableOpacity
                key={act}
                style={[styles.chip, activity === act && styles.chipActive]}
                onPress={() => setActivity(act)}
              >
                <Text style={[styles.chipText, activity === act && styles.chipTextActive]}>
                  {act.replace("_", " ")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Duration (minutes)</Text>
          <View style={styles.chipWrap}>
            {DURATIONS.map((mins) => (
              <TouchableOpacity
                key={mins}
                style={[styles.chip, duration === mins && styles.chipActive]}
                onPress={() => setDuration(mins)}
              >
                <Text style={[styles.chipText, duration === mins && styles.chipTextActive]}>
                  {mins}m
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.input}
            placeholder="Optional note (e.g. Evening run in park)"
            placeholderTextColor={colors.muted}
            value={label}
            onChangeText={setLabel}
          />

          <TouchableOpacity style={styles.startBtn} onPress={handleStart} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={styles.startBtnText}>Start Safe Session</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Movement History */}
      <View style={styles.historyHeader}>
        <Text style={styles.heading}>Movement History</Text>
        <View style={styles.filterRow}>
          {[24, 168].map((h) => (
            <TouchableOpacity
              key={h}
              style={[styles.filterBtn, hoursFilter === h && styles.filterBtnActive]}
              onPress={() => setHoursFilter(h)}
            >
              <Text style={[styles.filterText, hoursFilter === h && styles.filterTextActive]}>
                {h === 24 ? "24h" : "7d"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {historyLocations.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.meta}>No recorded checkpoints in this window yet.</Text>
        </View>
      ) : (
        historyLocations.slice(0, 30).map((pt, idx) => (
          <View key={pt._id || `${pt.recordedAt}-${idx}`} style={styles.historyItem}>
            <View>
              <Text style={styles.coord}>
                {pt.latitude.toFixed(5)}, {pt.longitude.toFixed(5)}
              </Text>
              <Text style={styles.meta}>
                {new Date(pt.recordedAt).toLocaleString()}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.speed}>
                {((pt.speed ?? 0) * 3.6).toFixed(1)} km/h
              </Text>
              <Text style={styles.meta}>±{Math.round(pt.accuracy ?? 10)}m</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 52, paddingBottom: 36 },
  heading: { fontSize: 22, fontWeight: "800", color: colors.text },
  sub: { color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: 16 },
  activeCard: {
    backgroundColor: "#052E16",
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 22,
  },
  activeBadge: { color: colors.success, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  activeTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 6 },
  endBtn: {
    marginTop: 14,
    backgroundColor: colors.danger,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
  },
  endBtnText: { color: colors.text, fontWeight: "700", fontSize: 14 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 22,
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 12 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "600", marginTop: 10, marginBottom: 8 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  chipTextActive: { color: colors.bg, fontWeight: "700" },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    color: colors.text,
    marginTop: 14,
    marginBottom: 14,
  },
  startBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
  },
  startBtnText: { color: colors.bg, fontSize: 15, fontWeight: "700" },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  filterRow: { flexDirection: "row", gap: 6 },
  filterBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  filterBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  filterTextActive: { color: colors.bg },
  historyItem: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  coord: { color: colors.text, fontSize: 14, fontWeight: "700" },
  speed: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
