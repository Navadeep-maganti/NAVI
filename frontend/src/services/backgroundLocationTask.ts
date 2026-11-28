import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import { apiClient, TOKEN_STORAGE_KEY } from "../config/api";
import { getTimezoneOffsetMinutes, toLocalIsoString } from "../utils/time";

export const NAVI_BACKGROUND_LOCATION_TASK = "NAVI_BACKGROUND_LOCATION_TASK";

TaskManager.defineTask(NAVI_BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;

  const { locations } = data as { locations?: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;

  const token = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
  if (!token) return;

  const latest = locations[locations.length - 1];
  const dt = new Date(latest.timestamp);
  const payload = {
    latitude: latest.coords.latitude,
    longitude: latest.coords.longitude,
    altitude: latest.coords.altitude ?? 0,
    speed: Math.max(0, latest.coords.speed ?? 0),
    accuracy: Math.max(0, latest.coords.accuracy ?? 10),
    timestamp: toLocalIsoString(dt),
    timezoneOffsetMinutes: getTimezoneOffsetMinutes(dt),
  };

  try {
    await apiClient.post("/api/location/update", payload);
  } catch {
    // Ignore deduplicated / rate-limited points and still run safety check.
  }

  try {
    const res = await apiClient.post("/api/ml/safety-assessment", payload);
    if (res.data?.checkinAlert) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "NAVI Safety Check-In",
          body: `Elevated risk detected (${res.data.decision?.contextualRiskLevel || "alert"}). Tap to confirm you are safe.`,
          data: { alertId: res.data.checkinAlert._id },
        },
        trigger: null,
      });
    }
  } catch {
    // Silent failure in background task to avoid OS task termination.
  }
});
