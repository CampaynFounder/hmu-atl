import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import {
  BACKGROUND_LOCATION_TASK,
  LOCATION_TASK_RIDE_ID_KEY,
  LOCATION_TASK_TOKEN_KEY,
} from '@/tasks/location-task';

export async function startRideTracking(rideId: string, token: string): Promise<boolean> {
  try {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== 'granted') return false;

    // Write context for the background task to read
    await Promise.all([
      SecureStore.setItemAsync(LOCATION_TASK_RIDE_ID_KEY, rideId),
      SecureStore.setItemAsync(LOCATION_TASK_TOKEN_KEY, token),
    ]);

    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (isRunning) return true;

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15_000,      // update every 15s
      distanceInterval: 50,      // or every 50m, whichever comes first
      deferredUpdatesInterval: 30_000,
      deferredUpdatesDistance: 100,
      showsBackgroundLocationIndicator: true,  // iOS blue status bar pill
      foregroundService: {
        // Android: keeps the task alive as a foreground service
        notificationTitle: 'HMU ATL — Active Ride',
        notificationBody: 'Tracking your location for the current ride.',
        notificationColor: '#00E676',
      },
      pausesUpdatesAutomatically: false,
    });

    return true;
  } catch {
    return false;
  }
}

export async function stopRideTracking(): Promise<void> {
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
    await Promise.all([
      SecureStore.deleteItemAsync(LOCATION_TASK_RIDE_ID_KEY),
      SecureStore.deleteItemAsync(LOCATION_TASK_TOKEN_KEY),
    ]);
  } catch {
    // Best-effort cleanup
  }
}

export async function refreshTrackingToken(token: string): Promise<void> {
  try {
    const rideId = await SecureStore.getItemAsync(LOCATION_TASK_RIDE_ID_KEY);
    if (!rideId) return; // No active tracking session
    await SecureStore.setItemAsync(LOCATION_TASK_TOKEN_KEY, token);
  } catch {
    // Best-effort
  }
}

export async function isTrackingActive(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  } catch {
    return false;
  }
}
