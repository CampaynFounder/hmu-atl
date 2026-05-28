// Background location task — must be defined at module top level, never inside a component.
// Imported by _layout.tsx so it's registered before any ride screen mounts.

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';

export const BACKGROUND_LOCATION_TASK = 'hmu-background-location';

// Keys used by the foreground ride screen to pass context into the task
export const LOCATION_TASK_RIDE_ID_KEY = 'location_task_ride_id';
export const LOCATION_TASK_TOKEN_KEY = 'location_task_token';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://atl.hmucashride.com/api';

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody) => {
  if (error) {
    return;
  }

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
    // Background task — swallow all errors, never crash the task runner
  }
});
