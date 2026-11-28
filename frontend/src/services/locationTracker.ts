import * as Location from "expo-location";
import { GeoPoint, MonitoringPreset } from "../store/safetyStore";
import { getTimezoneOffsetMinutes, toLocalIsoString } from "../utils/time";

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
  activeSubscription = await Location.watchPositionAsync(
    {
      accuracy: preset === "high" ? Location.Accuracy.High : Location.Accuracy.Balanced,
      timeInterval: cfg.timeInterval,
      distanceInterval: cfg.distanceInterval,
    },
    (loc) => {
      onLocation(toGeoPoint(loc));
    }
  );
  return true;
};

export const stopForegroundMonitoring = () => {
  if (activeSubscription) {
    activeSubscription.remove();
    activeSubscription = null;
  }
};
