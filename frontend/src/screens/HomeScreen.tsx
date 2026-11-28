import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  fetchCurrentLocation,
  startForegroundMonitoring,
  stopForegroundMonitoring,
} from "../services/locationTracker";
import { useAuthStore } from "../store/authStore";
import { useSafetyStore } from "../store/safetyStore";
import { colors } from "../theme/colors";

const RISK_COLORS: Record<string, string> = {
  low: colors.success,
  moderate: colors.primary,
  elevated: colors.warning,
  critical: colors.danger,
};

const formatDistance = (metres: number) =>
  metres >= 1000 ? `${(metres / 1000).toFixed(2)} km` : `${metres} m`;

export const HomeScreen: React.FC = () => {
  const { token, user, logout } = useAuthStore();
  const {
    currentLocation,
    isMonitoring,
    socketConnected,
    safetyStatus,
    todaySummary,
    activeSessionType,
    liveShareActive,
    pendingCheckin,
    sosLoading,
    lastSosMessage,
    refreshing,
    setMonitoring,
    connectSocket,
    disconnectSocket,
    refreshDashboard,
    sendLocationAndAssess,
    triggerSOS,
    respondToCheckin,
  } = useSafetyStore();

  useEffect(() => {
    if (token) connectSocket(token);
    refreshDashboard(true);
    fetchCurrentLocation().then((loc) => {
      if (loc) sendLocationAndAssess(loc);
    });

    return () => {
      stopForegroundMonitoring();
      disconnectSocket();
    };
  }, [token]);

  const handleToggleMonitoring = async (next: boolean) => {
    if (next) {
      const started = await startForegroundMonitoring((pt) => {
        sendLocationAndAssess(pt);
      });
      if (!started) {
        Alert.alert("Location Permission Needed", "Enable location access in Settings to start live monitoring.");
        return;
      }
      setMonitoring(true);
    } else {
      stopForegroundMonitoring();
      setMonitoring(false);
    }
  };

  const handleRefreshNow = async () => {
    const loc = await fetchCurrentLocation();
    if (loc) {
      await sendLocationAndAssess(loc);
    } else {
      await refreshDashboard();
    }
  };

  const handlePressSOS = () => {
    Alert.alert(
      "Trigger Emergency SOS?",
      "This will immediately notify your trusted contacts with your location and start a live-tracking link.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Send SOS", style: "destructive", onPress: () => triggerSOS("Manual SOS from NAVI Dashboard") },
      ]
    );
  };

  const riskLevel = safetyStatus?.contextualRiskLevel || "low";
  const riskColor = RISK_COLORS[riskLevel] || colors.primary;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefreshNow} tintColor={colors.primary} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>NAVI</Text>
          <Text style={styles.greeting}>Hi, {user?.name || "User"}</Text>
        </View>
        <TouchableOpacity style={styles.logoutPill} onPress={logout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Active Safety Check-In Banner */}
      {pendingCheckin && (
        <View style={styles.checkinCard}>
          <Text style={styles.checkinTitle}>Safety Check-In Required</Text>
          <Text style={styles.checkinSub}>
            Risk level is {pendingCheckin.contextualRiskLevel.toUpperCase()}. Please confirm you are okay.
          </Text>
          <View style={styles.checkinActions}>
            <TouchableOpacity
              style={[styles.checkinBtn, { backgroundColor: colors.success }]}
              onPress={() => respondToCheckin("safe")}
            >
              <Text style={styles.checkinBtnText}>I&apos;m Safe</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.checkinBtn, { backgroundColor: colors.danger }]}
              onPress={() => respondToCheckin("need_help")}
            >
              <Text style={styles.checkinBtnText}>Need Help</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {lastSosMessage && (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>{lastSosMessage}</Text>
        </View>
      )}

      {/* 1. Current Safety Status */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardLabel}>CURRENT SAFETY STATUS</Text>
          <View style={[styles.badge, { backgroundColor: riskColor }]}>
            <Text style={styles.badgeText}>{riskLevel.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.scoreText}>
          Risk Score: {safetyStatus ? `${Math.round(safetyStatus.contextualRiskScore * 100)}%` : "Assessing..."}
        </Text>
        {safetyStatus && (
          <Text style={styles.metaText}>
            Area Risk: {Math.round(safetyStatus.environmentalScore * 100)}% • Behavior Deviation:{" "}
            {safetyStatus.adjustedBehavioralScore != null
              ? `${Math.round(safetyStatus.adjustedBehavioralScore * 100)}%`
              : "Learning (7d needed)"}
          </Text>
        )}
        {activeSessionType && (
          <Text style={styles.sessionTag}>Active Safe Session: {activeSessionType}</Text>
        )}
      </View>

      {/* 2. Monitoring Status */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.cardLabel}>MONITORING STATUS</Text>
            <Text style={styles.cardValue}>
              {isMonitoring ? "Live GPS Monitoring Active" : "Background Watch Paused"}
            </Text>
            <Text style={styles.metaText}>
              Real-time Socket: {socketConnected ? "Connected" : "Reconnecting..."} • Live Share:{" "}
              {liveShareActive ? "ON" : "OFF"}
            </Text>
          </View>
          <Switch value={isMonitoring} onValueChange={handleToggleMonitoring} />
        </View>
      </View>

      {/* 3. Current Location */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardLabel}>CURRENT LOCATION</Text>
          <TouchableOpacity onPress={handleRefreshNow}>
            <Text style={styles.linkText}>Refresh</Text>
          </TouchableOpacity>
        </View>
        {currentLocation ? (
          <>
            <Text style={styles.cardValue}>
              {currentLocation.latitude.toFixed(5)}, {currentLocation.longitude.toFixed(5)}
            </Text>
            <Text style={styles.metaText}>
              Speed: {(currentLocation.speed * 3.6).toFixed(1)} km/h • Accuracy: ±{Math.round(currentLocation.accuracy)} m
            </Text>
            <Text style={styles.metaText}>
              Updated: {new Date(currentLocation.timestamp).toLocaleTimeString()}
            </Text>
          </>
        ) : (
          <Text style={styles.metaText}>Waiting for GPS fix...</Text>
        )}
      </View>

      {/* 4. Today's Movement Summary */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>TODAY&apos;S MOVEMENT SUMMARY</Text>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{formatDistance(todaySummary.distanceMetres)}</Text>
            <Text style={styles.statLabel}>Distance</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{todaySummary.pointsCount}</Text>
            <Text style={styles.statLabel}>Checkpoints</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{(todaySummary.maxSpeedMps * 3.6).toFixed(1)}</Text>
            <Text style={styles.statLabel}>Max km/h</Text>
          </View>
        </View>
      </View>

      {/* 5. Quick Access to SOS */}
      <TouchableOpacity
        style={[styles.sosButton, sosLoading && { opacity: 0.7 }]}
        onPress={handlePressSOS}
        disabled={sosLoading}
      >
        {sosLoading ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <>
            <Text style={styles.sosTitle}>SOS EMERGENCY</Text>
            <Text style={styles.sosSub}>Tap to alert trusted contacts &amp; share live location</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 52, paddingBottom: 36, gap: 14 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  brand: { fontSize: 12, fontWeight: "800", letterSpacing: 4, color: colors.primary },
  greeting: { fontSize: 24, fontWeight: "800", color: colors.text },
  logoutPill: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  logoutText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  checkinCard: {
    backgroundColor: "#451A03",
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  checkinTitle: { color: "#FDE68A", fontSize: 16, fontWeight: "800" },
  checkinSub: { color: "#FCD34D", fontSize: 13, marginTop: 4, marginBottom: 12 },
  checkinActions: { flexDirection: "row", gap: 10 },
  checkinBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: "center" },
  checkinBtnText: { color: colors.text, fontWeight: "700", fontSize: 14 },
  noticeBox: {
    backgroundColor: "#172554",
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  noticeText: { color: "#BAE6FD", fontSize: 13 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  cardValue: { color: colors.text, fontSize: 17, fontWeight: "700", marginBottom: 4 },
  scoreText: { color: colors.text, fontSize: 22, fontWeight: "800", marginBottom: 4 },
  metaText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  sessionTag: { color: colors.primary, fontSize: 13, fontWeight: "600", marginTop: 6 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { color: "#0B1220", fontSize: 11, fontWeight: "800" },
  linkText: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  statsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  statBox: { flex: 1, alignItems: "center", paddingVertical: 6 },
  statNum: { color: colors.text, fontSize: 20, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
  sosButton: {
    backgroundColor: colors.danger,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: "center",
    marginTop: 4,
  },
  sosTitle: { color: colors.text, fontSize: 18, fontWeight: "900", letterSpacing: 1 },
  sosSub: { color: "#FEE2E2", fontSize: 12, marginTop: 4 },
});
