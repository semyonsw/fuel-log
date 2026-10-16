/**
 * Recording a trip with GPS, with the screen off and the app in the background.
 *
 * ── HOW IT KEEPS RUNNING ─────────────────────────────────────────────────
 *
 * expo-location's background updates run as an Android foreground service
 * with a persistent notification ("Recording your trip"), which is what lets
 * them survive the screen turning off in the car. Fixes arrive at a task
 * defined at module scope (TaskManager needs it registered before the app
 * mounts, also when Android wakes the JS headless), and the task appends
 * them to AsyncStorage, so a recording survives the app being swiped away.
 *
 * ── BATTERY ──────────────────────────────────────────────────────────────
 *
 * High accuracy, a fix every 5 s or 10 m, whichever comes later. At city
 * speeds that is a point every 40–80 m — plenty for a route line and for a
 * distance accurate to well under 1% — without GPS running flat out.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { create } from 'zustand';

import { processTrack, trackDistanceKm, filterJitter, type RawFix } from '../lib/geo';
import { colors } from '../theme';
import type { TrackPoint } from '../types';

export const TRACK_TASK = 'fuel-log-track';
const BUFFER_KEY = 'fuel-log/track-buffer/v1';
const STARTED_KEY = 'fuel-log/track-started/v1';

type TrackingState = {
  /** Epoch ms the recording started, or null when not recording. */
  startedAt: number | null;
  /** Filtered points so far, for the live km on the Log card. */
  points: TrackPoint[];
};

export const useTracking = create<TrackingState>(() => ({ startedAt: null, points: [] }));

async function readBuffer(): Promise<RawFix[]> {
  try {
    const raw = await AsyncStorage.getItem(BUFFER_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// Appends are serialised so two batches arriving together cannot overwrite each other.
let writing: Promise<unknown> = Promise.resolve();
function append(fixes: RawFix[]) {
  writing = writing.then(async () => {
    const all = [...(await readBuffer()), ...fixes];
    await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(all));
    useTracking.setState({ points: filterJitter(all) });
  });
  return writing;
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  TRACK_TASK,
  async ({ data, error }) => {
    if (error || !data?.locations) return;
    await append(
      data.locations.map((l) => ({
        lat: l.coords.latitude,
        lon: l.coords.longitude,
        t: l.timestamp,
        accuracy: l.coords.accuracy,
      })),
    );
  },
);

/** On launch: pick up a recording that was running when the app was closed. */
export async function restoreTracking(): Promise<void> {
  try {
    // Even if the service died (phone restart), what was recorded is kept and
    // the card shows, so the user can stop and save it.
    const started = await AsyncStorage.getItem(STARTED_KEY);
    if (started) {
      useTracking.setState({
        startedAt: Number(started),
        points: filterJitter(await readBuffer()),
      });
    }
  } catch {
    // Not recording.
  }
}

export type StartResult = 'started' | 'no-permission' | 'no-background' | 'failed';

export async function startTracking(): Promise<StartResult> {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return 'no-permission';
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return 'no-background';
    const now = Date.now();
    await AsyncStorage.setItem(BUFFER_KEY, '[]');
    await AsyncStorage.setItem(STARTED_KEY, String(now));
    await Location.startLocationUpdatesAsync(TRACK_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: 10,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      foregroundService: {
        notificationTitle: 'Recording your trip',
        notificationBody: 'Fuel Log is recording the route. Open the app to stop.',
        notificationColor: colors.accent,
        killServiceOnDestroy: false,
      },
    });
    useTracking.setState({ startedAt: now, points: [] });
    return 'started';
  } catch {
    return 'failed';
  }
}

/** Stops recording and hands back the cleaned, simplified track and its distance. */
export async function stopTracking(): Promise<{
  track: TrackPoint[];
  distanceKm: number;
  startedAt: number;
}> {
  const startedAt = useTracking.getState().startedAt ?? Date.now();
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TRACK_TASK)) {
      await Location.stopLocationUpdatesAsync(TRACK_TASK);
    }
  } catch {
    // Already stopped.
  }
  await writing;
  const result = processTrack(await readBuffer());
  await AsyncStorage.multiRemove([BUFFER_KEY, STARTED_KEY]).catch(() => {});
  useTracking.setState({ startedAt: null, points: [] });
  return { ...result, startedAt };
}

/** Live distance of the recording so far. */
export function liveDistanceKm(points: TrackPoint[]): number {
  return trackDistanceKm(points);
}
