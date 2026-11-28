import { io, Socket } from "socket.io-client";
import { create } from "zustand";
import { API_BASE_URL, apiClient } from "../config/api";

export interface GeoPoint {
  latitude: number;
  longitude: number;
  altitude?: number;
  speed: number;
  accuracy: number;
  timestamp: string;
}

export interface HistoryPoint {
  _id?: string;
  latitude: number;
  longitude: number;
  speed?: number;
  accuracy?: number;
  recordedAt: string;
}

export interface AreaZone {
  id: string;
  name: string | null;
  latitude: number;
  longitude: number;
  radiusMetres: number;
  baseRiskScore: number;
  riskFactors: string[];
}

export interface ActiveSafeSession {
  _id: string;
  activityType: string;
  label?: string;
  startsAt: string;
  endsAt: string;
  expectedMaxSpeedMps?: number | null;
}

export interface ActiveLiveShare {
  shareToken: string;
  expiresAt: string;
}

export interface SafetyStatus {
  contextualRiskLevel: "low" | "moderate" | "elevated" | "critical";
  contextualRiskScore: number;
  recommendedAction: string;
  environmentalScore: number;
  adjustedBehavioralScore: number | null;
  factors: string[];
}

export interface TodaySummary {
  pointsCount: number;
  distanceMetres: number;
  maxSpeedMps: number;
  lastUpdated: string | null;
}

export interface PendingCheckin {
  alertId: string;
  contextualRiskLevel: string;
  checkinDeadline: string;
}

export type MonitoringPreset = "high" | "balanced" | "saver";

const EARTH_RADIUS_M = 6371000;
const haversineMetres = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const summarizeTodayLocations = (locations: HistoryPoint[]): TodaySummary => {
  if (!locations.length) {
    return { pointsCount: 0, distanceMetres: 0, maxSpeedMps: 0, lastUpdated: null };
  }
  const ordered = [...locations].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );
  let distance = 0;
  let maxSpeed = 0;
  for (let i = 0; i < ordered.length; i += 1) {
    maxSpeed = Math.max(maxSpeed, ordered[i].speed || 0);
    if (i > 0) distance += haversineMetres(ordered[i - 1], ordered[i]);
  }
  return {
    pointsCount: ordered.length,
    distanceMetres: Math.round(distance),
    maxSpeedMps: Number(maxSpeed.toFixed(2)),
    lastUpdated: ordered[ordered.length - 1].recordedAt,
  };
};

interface SafetyState {
  currentLocation: GeoPoint | null;
  isMonitoring: boolean;
  monitoringPreset: MonitoringPreset;
  socketConnected: boolean;
  safetyStatus: SafetyStatus | null;
  todaySummary: TodaySummary;
  historyLocations: HistoryPoint[];
  nearbyAreaZones: AreaZone[];
  activeSession: ActiveSafeSession | null;
  activeSessionType: string | null;
  liveShareSession: ActiveLiveShare | null;
  liveShareActive: boolean;
  pendingCheckin: PendingCheckin | null;
  sosLoading: boolean;
  lastSosMessage: string | null;
  refreshing: boolean;
  socket: Socket | null;
  setMonitoring: (enabled: boolean) => void;
  setMonitoringPreset: (preset: MonitoringPreset) => void;
  connectSocket: (token: string) => void;
  disconnectSocket: () => void;
  refreshDashboard: () => Promise<void>;
  fetchHistory: (hours?: number) => Promise<void>;
  fetchNearbyZones: (latitude: number, longitude: number) => Promise<void>;
  startSafeSession: (payload: { activityType: string; label?: string; durationMinutes: number }) => Promise<boolean>;
  endSafeSession: (id: string) => Promise<void>;
  startLiveShare: (durationMinutes?: number) => Promise<string | null>;
  stopLiveShare: () => Promise<void>;
  sendLocationAndAssess: (point: GeoPoint) => Promise<void>;
  triggerSOS: (notes?: string) => Promise<boolean>;
  respondToCheckin: (response: "safe" | "need_help") => Promise<void>;
}

export const useSafetyStore = create<SafetyState>((set, get) => ({
  currentLocation: null,
  isMonitoring: false,
  monitoringPreset: "balanced",
  socketConnected: false,
  safetyStatus: null,
  todaySummary: { pointsCount: 0, distanceMetres: 0, maxSpeedMps: 0, lastUpdated: null },
  historyLocations: [],
  nearbyAreaZones: [],
  activeSession: null,
  activeSessionType: null,
  liveShareSession: null,
  liveShareActive: false,
  pendingCheckin: null,
  sosLoading: false,
  lastSosMessage: null,
  refreshing: false,
  socket: null,

  setMonitoring: (enabled) => set({ isMonitoring: enabled }),
  setMonitoringPreset: (preset) => set({ monitoringPreset: preset }),

  connectSocket: (token) => {
    const existing = get().socket;
    if (existing?.connected) return;
    if (existing) existing.disconnect();

    const socket = io(API_BASE_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => set({ socketConnected: true }));
    socket.on("disconnect", () => set({ socketConnected: false }));
    socket.on("checkin:prompt", (payload: PendingCheckin) => {
      set({ pendingCheckin: payload });
    });
    socket.on("emergency:escalated", (payload: { notifiedCount?: number }) => {
      set({
        pendingCheckin: null,
        lastSosMessage: `Emergency alert sent to ${payload.notifiedCount ?? 0} trusted contact(s).`,
      });
    });

    set({ socket });
  },

  disconnectSocket: () => {
    const existing = get().socket;
    if (existing) existing.disconnect();
    set({ socket: null, socketConnected: false });
  },

  refreshDashboard: async () => {
    set({ refreshing: true });
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [historyRes, sessionRes, shareRes] = await Promise.allSettled([
        apiClient.get("/api/location/history", {
          params: { startDate: startOfDay.toISOString(), limit: 500 },
        }),
        apiClient.get("/api/safe-sessions/active"),
        apiClient.get("/api/live-share/active"),
      ]);

      if (historyRes.status === "fulfilled") {
        const locs: HistoryPoint[] = historyRes.value.data?.locations || [];
        const summary = summarizeTodayLocations(locs);
        const latest = locs[0];
        set((state) => ({
          todaySummary: summary,
          historyLocations: state.historyLocations.length ? state.historyLocations : locs,
          currentLocation:
            state.currentLocation ||
            (latest
              ? {
                  latitude: latest.latitude,
                  longitude: latest.longitude,
                  speed: latest.speed ?? 0,
                  accuracy: latest.accuracy ?? 10,
                  timestamp: latest.recordedAt,
                }
              : null),
        }));
      }

      if (sessionRes.status === "fulfilled") {
        const session = sessionRes.value.data?.session || null;
        set({
          activeSession: session,
          activeSessionType: session?.activityType || null,
        });
      }

      if (shareRes.status === "fulfilled") {
        const share = shareRes.value.data?.session || null;
        set({
          liveShareSession: share ? { shareToken: share.shareToken, expiresAt: share.expiresAt } : null,
          liveShareActive: Boolean(share),
        });
      }
    } finally {
      set({ refreshing: false });
    }
  },

  fetchHistory: async (hours = 24) => {
    try {
      const startDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const { data } = await apiClient.get("/api/location/history", {
        params: { startDate, limit: 200 },
      });
      set({ historyLocations: data.locations || [] });
    } catch {
      // Keep existing history if request fails.
    }
  },

  fetchNearbyZones: async (latitude, longitude) => {
    try {
      const { data } = await apiClient.get("/api/area-risk/nearby", {
        params: { latitude, longitude, radius: 3000 },
      });
      set({ nearbyAreaZones: data.zones || [] });
    } catch {
      // Keep existing zones if request fails.
    }
  },

  startSafeSession: async ({ activityType, label, durationMinutes }) => {
    try {
      const { data } = await apiClient.post("/api/safe-sessions", {
        activityType,
        label,
        durationMinutes,
      });
      const session = data.session;
      set({
        activeSession: session,
        activeSessionType: session?.activityType || null,
      });
      return true;
    } catch {
      return false;
    }
  },

  endSafeSession: async (id) => {
    try {
      await apiClient.patch(`/api/safe-sessions/${id}/end`);
      set({ activeSession: null, activeSessionType: null });
    } catch {
      // Ignore if already ended.
    }
  },

  startLiveShare: async (durationMinutes = 60) => {
    try {
      const { data } = await apiClient.post("/api/live-share/start", { durationMinutes });
      const share = data.session;
      set({
        liveShareSession: { shareToken: share.shareToken, expiresAt: share.expiresAt },
        liveShareActive: true,
      });
      return share.shareToken as string;
    } catch {
      return null;
    }
  },

  stopLiveShare: async () => {
    try {
      await apiClient.post("/api/live-share/stop");
    } finally {
      set({ liveShareSession: null, liveShareActive: false });
    }
  },

  sendLocationAndAssess: async (point) => {
    set({ currentLocation: point });
    try {
      await apiClient.post("/api/location/update", {
        latitude: point.latitude,
        longitude: point.longitude,
        altitude: point.altitude ?? 0,
        speed: point.speed,
        accuracy: point.accuracy,
        timestamp: point.timestamp,
      });
    } catch {
      // Location may be deduplicated (4xx/skipped) or rate-limited; still run assessment.
    }

    try {
      const { data } = await apiClient.post("/api/ml/safety-assessment", {
        latitude: point.latitude,
        longitude: point.longitude,
        speed: point.speed,
        accuracy: point.accuracy,
        timestamp: point.timestamp,
      });
      const decision = data.decision;
      const assessment = data.assessment;
      set({
        safetyStatus: {
          contextualRiskLevel: decision.contextualRiskLevel,
          contextualRiskScore: decision.contextualRiskScore,
          recommendedAction: decision.recommendedAction,
          environmentalScore: decision.environmentalScore,
          adjustedBehavioralScore: decision.adjustedBehavioralScore,
          factors: assessment?.environmentalRisk?.factors || [],
        },
        pendingCheckin: data.checkinAlert
          ? {
              alertId: data.checkinAlert._id,
              contextualRiskLevel: decision.contextualRiskLevel,
              checkinDeadline: data.checkinAlert.checkinDeadline,
            }
          : get().pendingCheckin,
      });
      await Promise.all([
        get().refreshDashboard(),
        get().fetchNearbyZones(point.latitude, point.longitude),
      ]);
    } catch {
      // Keep last known safetyStatus if ML service is temporarily unreachable.
    }
  },

  triggerSOS: async (notes) => {
    set({ sosLoading: true, lastSosMessage: null });
    try {
      const loc = get().currentLocation;
      const { data } = await apiClient.post("/api/alerts/sos", {
        latitude: loc?.latitude,
        longitude: loc?.longitude,
        speed: loc?.speed ?? 0,
        accuracy: loc?.accuracy ?? 10,
        timestamp: loc?.timestamp || new Date().toISOString(),
        notes,
      });
      const count = data.alert?.notifiedContacts?.length ?? 0;
      set({
        sosLoading: false,
        liveShareActive: true,
        lastSosMessage: `SOS active! ${count} trusted contact(s) notified with live location.`,
      });
      return true;
    } catch {
      set({ sosLoading: false, lastSosMessage: "Failed to send SOS. Check connection." });
      return false;
    }
  },

  respondToCheckin: async (response) => {
    const pending = get().pendingCheckin;
    if (!pending) return;
    try {
      await apiClient.post(`/api/alerts/${pending.alertId}/respond`, { response });
      set({
        pendingCheckin: null,
        lastSosMessage:
          response === "need_help"
            ? "Emergency escalated to your trusted contacts."
            : "Check-in confirmed safe.",
      });
    } catch {
      set({ pendingCheckin: null });
    }
  },
}));
