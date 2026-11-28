import React, { useEffect } from "react";
import { Alert, Share, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import MapView, { Circle, Marker, Polyline } from "react-native-maps";
import { API_BASE_URL } from "../config/api";
import {
  fetchCurrentLocation,
  startForegroundMonitoring,
  stopForegroundMonitoring,
} from "../services/locationTracker";
import { MonitoringPreset, useSafetyStore } from "../store/safetyStore";
import { colors } from "../theme/colors";

const PRESETS: Array<{ key: MonitoringPreset; label: string }> = [
  { key: "high", label: "5s" },
  { key: "balanced", label: "15s" },
  { key: "saver", label: "60s" },
];

export const LiveMapScreen: React.FC = () => {
  const {
    currentLocation,
    isMonitoring,
    monitoringPreset,
    historyLocations,
    nearbyAreaZones,
    liveShareActive,
    liveShareSession,
    setMonitoring,
    setMonitoringPreset,
    sendLocationAndAssess,
    fetchHistory,
    fetchNearbyZones,
    startLiveShare,
    stopLiveShare,
  } = useSafetyStore();

  useEffect(() => {
    fetchHistory(24);
    if (currentLocation) {
      fetchNearbyZones(currentLocation.latitude, currentLocation.longitude);
    }
  }, []);

  const handleToggleMonitoring = async (next: boolean) => {
    if (next) {
      const ok = await startForegroundMonitoring(
        (pt) => sendLocationAndAssess(pt),
        monitoringPreset
      );
      if (!ok) {
        Alert.alert("Permission Required", "Enable location access in Settings.");
        return;
      }
      setMonitoring(true);
    } else {
      stopForegroundMonitoring();
      setMonitoring(false);
    }
  };

  const handleSelectPreset = async (preset: MonitoringPreset) => {
    setMonitoringPreset(preset);
    if (isMonitoring) {
      await startForegroundMonitoring((pt) => sendLocationAndAssess(pt), preset);
    }
  };

  const handleToggleLiveShare = async () => {
    if (liveShareActive) {
      await stopLiveShare();
      return;
    }
    const token = await startLiveShare(60);
    if (token) {
      const shareUrl = `${API_BASE_URL}/share/${token}`;
      await Share.share({
        message: `Track my live NAVI location for 60 minutes: ${shareUrl}`,
      });
    }
  };

  const handlePingNow = async () => {
    const pt = await fetchCurrentLocation();
    if (pt) await sendLocationAndAssess(pt);
  };

  const region = {
    latitude: currentLocation?.latitude ?? 12.9716,
    longitude: currentLocation?.longitude ?? 77.5946,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  };

  const routeCoords = [...historyLocations]
    .reverse()
    .map((p) => ({ latitude: p.latitude, longitude: p.longitude }));

  return (
    <View style={styles.container}>
      <MapView style={styles.map} region={region} showsUserLocation>
        {currentLocation && (
          <Marker
            coordinate={{
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
            }}
            title="You"
            description={`Speed: ${(currentLocation.speed * 3.6).toFixed(1)} km/h`}
            pinColor={colors.primary}
          />
        )}

        {routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor={colors.primary} strokeWidth={4} />
        )}

        {nearbyAreaZones.map((zone) => {
          const isSafeHub = zone.riskFactors.includes("safe_hub") && zone.baseRiskScore <= 0.1;
          const fill = isSafeHub
            ? "rgba(34, 197, 94, 0.18)"
            : zone.baseRiskScore >= 0.6
            ? "rgba(239, 68, 68, 0.22)"
            : "rgba(245, 158, 11, 0.2)";
          const stroke = isSafeHub
            ? colors.success
            : zone.baseRiskScore >= 0.6
            ? colors.danger
            : colors.warning;
          return (
            <Circle
              key={zone.id}
              center={{ latitude: zone.latitude, longitude: zone.longitude }}
              radius={zone.radiusMetres}
              fillColor={fill}
              strokeColor={stroke}
              strokeWidth={1.5}
            />
          );
        })}
      </MapView>

      {/* Bottom Monitoring & Live Share Controls */}
      <View style={styles.controlsCard}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.title}>Live Monitoring</Text>
            <Text style={styles.sub}>
              {nearbyAreaZones.length} area zone(s) • {routeCoords.length} path points
            </Text>
          </View>
          <Switch value={isMonitoring} onValueChange={handleToggleMonitoring} />
        </View>

        <View style={styles.presetRow}>
          <Text style={styles.presetLabel}>Interval:</Text>
          {PRESETS.map((p) => (
            <TouchableOpacity
              key={p.key}
              style={[styles.presetBtn, monitoringPreset === p.key && styles.presetBtnActive]}
              onPress={() => handleSelectPreset(p.key)}
            >
              <Text
                style={[
                  styles.presetText,
                  monitoringPreset === p.key && styles.presetTextActive,
                ]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.pingBtn} onPress={handlePingNow}>
            <Text style={styles.pingText}>Ping GPS</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.shareBtn, liveShareActive && styles.shareBtnActive]}
          onPress={handleToggleLiveShare}
        >
          <Text style={styles.shareBtnText}>
            {liveShareActive
              ? "Stop Live Location Sharing"
              : "Share Live Location Link (60m)"}
          </Text>
        </TouchableOpacity>
        {liveShareActive && liveShareSession && (
          <Text style={styles.shareUrl} numberOfLines={1}>
            {API_BASE_URL}/share/{liveShareSession.shareToken}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  map: { flex: 1 },
  controlsCard: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    padding: 16,
    gap: 10,
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.text, fontSize: 16, fontWeight: "700" },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  presetRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  presetLabel: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  presetBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  presetBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  presetText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  presetTextActive: { color: colors.bg },
  pingBtn: {
    marginLeft: "auto",
    backgroundColor: colors.bg,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pingText: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  shareBtn: {
    backgroundColor: colors.primaryDark,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  shareBtnActive: { backgroundColor: colors.danger },
  shareBtnText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  shareUrl: { color: colors.primary, fontSize: 11, textAlign: "center" },
});
