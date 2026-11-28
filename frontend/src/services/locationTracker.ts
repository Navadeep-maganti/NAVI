import * as Location from "expo-location";
import { GeoPoint, MonitoringPreset } from "../store/safetyStore";
import { getTimezoneOffsetMinutes, toLocalIsoString } from "../utils/time";
import { NAVI_BACKGROUND_LOCATION_TASK } from "./backgroundLocationTask";

let activeSubscription: Location.LocationSubscription | null = null;

const PRESET_CONFIG: Record<MonitoringPreset, { timeInterval: number; distanceInterval: number }> = {
  high: { timeInterval: 5000, distanceInterval: 10 },
  balanced: { timeInterval: 15000, distanceInterval: 20 },
  saver: { timeInterval: 60000, distanceInterval: 50 },
};

const toGeoPoint = (loc: Location.LocationObject): GeoPoint => {
  const dt = new Date(loc.timestamp);
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    altitude: loc.coords.altitude ?? 0,
    speed: Math.max(0, loc.coords.speed ?? 0),
    accuracy: Math.max(0, loc.coords.accuracy ?? 10),
    timestamp: toLocalIsoString(dt),
    timezoneOffsetMinutes: getTimezoneOffsetMinutes(dt),
  };
};

export const fetchCurrentLocation = async (): Promise<GeoPoint | null> => {
  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== "granted") return null;
  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return toGeoPoint(loc);
};

export const startForegroundMonitoring = async (
  onLocation: (point: GeoPoint) => void,
  preset: MonitoringPreset = "balanced"
): Promise<boolean> => {
  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== "granted") return false;

  if (activeSubscription) {
    activeSubscription.remove();
    activeSubscription = null;
  }

  const cfg = PRESET_CONFIG[preset];
  const accuracy = preset === "high" ? Location.Accuracy.High : Location.Accuracy.Balanced;

  activeSubscription = await Location.watchPositionAsync(
    {
      accuracy,
      timeInterval: cfg.timeInterval,
      distanceInterval: cfg.distanceInterval,
    },
    (loc) => {
      onLocation(toGeoPoint(loc));
    }
  );

  // Also enable OS background tracking when background permission is granted (Expo Dev Build).
  try {
    const bgPerm = await Location.getBackgroundPermissionsAsync();
    if (bgPerm.status === "granted") {
      await Location.startLocationUpdatesAsync(NAVI_BACKGROUND_LOCATION_TASK, {
        accuracy,
        timeInterval: cfg.timeInterval,
        distanceInterval: cfg.distanceInterval,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "NAVI Protection Active",
          notificationBody: "Monitoring your route safety in the background.",
          notificationColor: "#38BDF8",
        },
      });
    }
  } catch {
    // Graceful fallback to foreground-only in Expo Go / simulators without background service.
  }

  return true;
};

export const stopForegroundMonitoring = async () => {
  if (activeSubscription) {
    activeSubscription.remove();
    activeSubscription = null;
  }
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(NAVI_BACKGROUND_LOCATION_TASK);
    if (started) {
      await Location.stopLocationUpdatesAsync(NAVI_BACKGROUND_LOCATION_TASK);
    }
  } catch {
    // Ignore when background task is unavailable.
  }
};
