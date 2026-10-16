/**
 * Every permission the app uses, asked together on the welcome screen.
 *
 * The user asked for everything up front rather than piecemeal. Order
 * matters on Android: background location can only be granted after
 * foreground location, and from Android 11 it is not a dialog at all — the
 * system opens the app's location settings, where the user picks "Allow all
 * the time". Notifications (Android 13+) are needed for the recording notice
 * to be visible. Anything refused is simply asked again when first used.
 */

import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { PermissionsAndroid, Platform } from 'react-native';

import { chooseBackupFolder } from './backup';

export type PermissionReport = {
  location: boolean;
  background: boolean;
  notifications: boolean;
  camera: boolean;
  folder: boolean;
};

async function notifications(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return true;
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

export async function requestAll(): Promise<PermissionReport> {
  const safe = async (f: () => Promise<boolean>) => {
    try {
      return await f();
    } catch {
      return false;
    }
  };
  const location = await safe(
    async () => (await Location.requestForegroundPermissionsAsync()).status === 'granted',
  );
  const background =
    location &&
    (await safe(
      async () => (await Location.requestBackgroundPermissionsAsync()).status === 'granted',
    ));
  const notif = await safe(notifications);
  const camera = await safe(
    async () => (await ImagePicker.requestCameraPermissionsAsync()).status === 'granted',
  );
  const folder = await safe(chooseBackupFolder);
  return { location, background, notifications: notif, camera, folder };
}
