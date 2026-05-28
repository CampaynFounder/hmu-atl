// Background location task — must be defined at module top level, never inside a component.
// Imported by _layout.tsx so it's registered before any ride screen mounts.
// Guards against missing native module in dev builds that predate the native rebuild.

import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';

export const BACKGROUND_LOCATION_TASK = 'hmu-background-location';
export const LOCATION_TASK_RIDE_ID_KEY = 'location_task_ride_id';
export const LOCATION_TASK_TOKEN_KEY = 'location_task_token';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://atl.hmucashride.com/api';

// expo-task-manager requires a native build that includes the module.
// Wrap in try/catch so dev builds that predate the native module don't crash.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const TaskManager = require('expo-task-manager') as typeof import('expo-task-manager');

  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: import('expo-task-manager').TaskManagerTaskBody) => {
    if (error) return;

    const { locations } = data as { locations: Location.LocationObject[] };
    const location = locations?.[0];
    if (!location) return;

    try {
      const [rideId, token] = await Promise.all([
        SecureStore.getItemAsync(LOCATION_TASK_RIDE_ID_KEY),
        SecureStore.getItemAsync(LOCATION_TASK_TOKEN_KEY),
      ]);

      if (!rideId || !token) return;

      await fetch(`${API_BASE}/rides/${rideId}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          accuracy: location.coords.accuracy,
          heading: location.coords.heading,
          speed: location.coords.speed,
          timestamp: location.timestamp,
        }),
      });
    } catch {
      // Background task — swallow all errors
    }
  });
} catch {
  console.warn('[location-task] expo-task-manager not available — background tracking disabled');
}
