import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { apiClient } from "../config/api";
import { colors } from "../theme/colors";

interface RegularPlace {
  clusterId: number;
  latitude: number;
  longitude: number;
  visitCount: number;
  distinctDays?: number;
  peakHours?: number[];
  boundary?: { radius95Metres?: number };
}

interface RoutineRoute {
  fromClusterId: number;
  toClusterId: number;
  transitionCount: number;
}

interface BehaviorProfile {
  learnedAt: string;
  profileVersion?: string;
  dataSufficiency?: {
    minimumPoints: number;
    observedPoints: number;
    minimumSpanDays: number;
    observedSpanDays: number;
  };
  regularPlaces: RegularPlace[];
  routineRoutes: RoutineRoute[];
  activityPatterns?: {
    hourlyActivity?: Record<string, number>;
    peakHours?: number[];
    peakWeekdays?: number[];
  };
  movementBaseline?: {
    meanSpeedMps?: number;
    speed95Mps?: number;
  };
  noiseSummary?: { count: number; percentage: number };
}

interface SafetyAlertItem {
  _id: string;
  type: string;
  status: string;
  triggerReason: string;
  createdAt: string;
  decisionSnapshot?: { contextualRiskLevel?: string; contextualRiskScore?: number };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const InsightsScreen: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adapting, setAdapting] = useState(false);

  const [profileReady, setProfileReady] = useState(false);
  const [sufficiency, setSufficiency] = useState<BehaviorProfile["dataSufficiency"] | null>(null);
  const [profile, setProfile] = useState<BehaviorProfile | null>(null);
  const [alerts, setAlerts] = useState<SafetyAlertItem[]>([]);

  const loadInsights = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [profRes, alertRes] = await Promise.allSettled([
        apiClient.get("/api/ml/behavior-profile"),
        apiClient.get("/api/alerts", { params: { limit: 15 } }),
      ]);

      if (profRes.status === "fulfilled") {
        const d = profRes.value.data;
        setProfileReady(Boolean(d.profileReady));
        setProfile(d.profile || null);
        setSufficiency(d.profile?.dataSufficiency || d.dataSufficiency || null);
      }
      if (alertRes.status === "fulfilled") {
        setAlerts(alertRes.value.data?.alerts || []);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadInsights();
  }, []);

  const handleAdaptNow = async () => {
    setAdapting(true);
    try {
      const { data } = await apiClient.post("/api/ml/behavior-profile/adapt?days=30", {});
      if (data.profileReady) {
        setProfileReady(true);
        setProfile(data.profile);
        setSufficiency(data.profile?.dataSufficiency || null);
      } else {
        setSufficiency(data.dataSufficiency || null);
        Alert.alert(
          "Still Learning",
          `Need 50+ points across 7+ days (currently ${data.dataSufficiency?.observedPoints ?? 0} pts / ${data.dataSufficiency?.observedSpanDays ?? 0} days).`
        );
      }
    } catch {
      Alert.alert("Unavailable", "ML service could not be reached right now.");
    } finally {
      setAdapting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const hourly = profile?.activityPatterns?.hourlyActivity || {};
  const maxHourCount = Math.max(1, ...Object.values(hourly).map(Number));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => loadInsights(true)} tintColor={colors.primary} />
      }
    >
      <Text style={styles.heading}>Activity &amp; Behavioral Insights</Text>
      <Text style={styles.sub}>Personalized patterns learned from your movement history</Text>

      {/* 1. Behavioral Learning Status */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardLabel}>BEHAVIORAL LEARNING STATUS</Text>
          <View style={[styles.badge, { backgroundColor: profileReady ? colors.success : colors.warning }]}>
            <Text style={styles.badgeText}>{profileReady ? "READY" : "LEARNING"}</Text>
          </View>
        </View>
        {sufficiency && (
          <Text style={styles.meta}>
            Data: {sufficiency.observedPoints} / {sufficiency.minimumPoints} points •{" "}
            {sufficiency.observedSpanDays} / {sufficiency.minimumSpanDays} days
          </Text>
        )}
        {profile?.learnedAt && (
          <Text style={styles.meta}>
            Last updated: {new Date(profile.learnedAt).toLocaleString()} ({profile.profileVersion || "dbscan-v1"})
          </Text>
        )}
        <TouchableOpacity style={styles.adaptBtn} onPress={handleAdaptNow} disabled={adapting}>
          {adapting ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.adaptBtnText}>Run Adaptive Re-Clustering</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* 2. Frequently Visited Places */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>FREQUENTLY VISITED PLACES</Text>
        {!profile?.regularPlaces?.length ? (
          <Text style={styles.meta}>No regular clusters learned yet (needs 7+ days of GPS history).</Text>
        ) : (
          profile.regularPlaces.slice(0, 6).map((p) => (
            <View key={p.clusterId} style={styles.listItem}>
              <Text style={styles.itemTitle}>
                Place #{p.clusterId} ({p.visitCount} visits{p.distinctDays ? `, ${p.distinctDays}d` : ""})
              </Text>
              <Text style={styles.meta}>
                {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)} • r95={p.boundary?.radius95Metres ?? "?"}m
                {p.peakHours?.length ? ` • Peak hrs: ${p.peakHours.join(", ")}h` : ""}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* 3. Common Travel Patterns */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>COMMON TRAVEL PATTERNS</Text>
        {profile?.movementBaseline && (
          <Text style={styles.meta}>
            Baseline speed: avg {((profile.movementBaseline.meanSpeedMps ?? 0) * 3.6).toFixed(1)} km/h • 95th{" "}
            {((profile.movementBaseline.speed95Mps ?? 0) * 3.6).toFixed(1)} km/h
          </Text>
        )}
        {!profile?.routineRoutes?.length ? (
          <Text style={styles.meta}>No recurring cluster-to-cluster routes detected yet.</Text>
        ) : (
          profile.routineRoutes.slice(0, 6).map((r, i) => (
            <View key={`${r.fromClusterId}-${r.toClusterId}-${i}`} style={styles.listItem}>
              <Text style={styles.itemTitle}>
                Place #{r.fromClusterId} → Place #{r.toClusterId} ({r.transitionCount}x)
              </Text>
            </View>
          ))
        )}
      </View>

      {/* 4. Activity Timeline */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>ACTIVITY TIMELINE (HOURLY)</Text>
        {Object.keys(hourly).length === 0 ? (
          <Text style={styles.meta}>Activity distribution will appear once your profile is ready.</Text>
        ) : (
          <>
            <View style={styles.barChart}>
              {Array.from({ length: 24 }, (_, h) => {
                const count = Number(hourly[String(h)] || 0);
                const heightPct = Math.max(6, Math.round((count / maxHourCount) * 100));
                return (
                  <View key={h} style={styles.barCol}>
                    <View style={[styles.bar, { height: `${heightPct}%`, opacity: count > 0 ? 1 : 0.2 }]} />
                  </View>
                );
              })}
            </View>
            <View style={styles.axisRow}>
              <Text style={styles.axisText}>0h</Text>
              <Text style={styles.axisText}>6h</Text>
              <Text style={styles.axisText}>12h</Text>
              <Text style={styles.axisText}>18h</Text>
              <Text style={styles.axisText}>23h</Text>
            </View>
            {profile?.activityPatterns?.peakWeekdays?.length ? (
              <Text style={styles.meta}>
                Most active days:{" "}
                {profile.activityPatterns.peakWeekdays.map((d) => WEEKDAYS[d] || d).join(", ")}
              </Text>
            ) : null}
          </>
        )}
      </View>

      {/* 5. Unusual Activity Summaries */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>UNUSUAL ACTIVITY SUMMARIES</Text>
        {profile?.noiseSummary && (
          <Text style={styles.meta}>
            Unfamiliar / non-routine samples: {profile.noiseSummary.count} ({profile.noiseSummary.percentage}%)
          </Text>
        )}
        {alerts.length === 0 ? (
          <Text style={styles.meta}>No safety check-ins or emergency alerts recorded.</Text>
        ) : (
          alerts.slice(0, 6).map((a) => (
            <View key={a._id} style={styles.listItem}>
              <Text style={styles.itemTitle}>
                {a.type.replace("_", " ").toUpperCase()} • {a.status.replace("_", " ")}
              </Text>
              <Text style={styles.meta}>
                Reason: {a.triggerReason}
                {a.decisionSnapshot?.contextualRiskLevel ? ` • Risk: ${a.decisionSnapshot.contextualRiskLevel}` : ""} •{" "}
                {new Date(a.createdAt).toLocaleString()}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 52, paddingBottom: 36, gap: 14 },
  heading: { fontSize: 22, fontWeight: "800", color: colors.text },
  sub: { color: colors.muted, fontSize: 13, marginBottom: 4 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  cardLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { color: "#0B1220", fontSize: 11, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  adaptBtn: {
    marginTop: 12,
    backgroundColor: colors.primary,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
  },
  adaptBtnText: { color: colors.bg, fontSize: 14, fontWeight: "700" },
  listItem: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  itemTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  barChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 70,
    gap: 2,
    marginTop: 8,
  },
  barCol: { flex: 1, height: "100%", justifyContent: "flex-end" },
  bar: { backgroundColor: colors.primary, borderRadius: 2, width: "100%" },
  axisRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, marginBottom: 6 },
  axisText: { color: colors.muted, fontSize: 10 },
});
