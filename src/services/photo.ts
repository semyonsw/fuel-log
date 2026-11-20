/**
 * A dashboard photo, from the camera or the gallery, shrunk for upload.
 *
 * Longest side 1280 px at JPEG 0.7: the cluster's digits stay sharp and the
 * upload is ~150 KB instead of several MB on a car's patchy mobile data. The
 * result is base64 in memory only; nothing is written to the gallery or kept.
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

const LONGEST = 1280;

export type Photo = { base64: string; uri: string };

export async function takePhoto(source: 'camera' | 'gallery'): Promise<Photo | 'denied' | null> {
  if (source === 'camera') {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (p.status !== 'granted') return 'denied';
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const res =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const resize =
    a.width >= a.height
      ? { width: Math.min(LONGEST, a.width) }
      : { height: Math.min(LONGEST, a.height) };
  const ref = await ImageManipulator.ImageManipulator.manipulate(a.uri)
    .resize(resize)
    .renderAsync();
  const out = await ref.saveAsync({
    format: ImageManipulator.SaveFormat.JPEG,
    compress: 0.7,
    base64: true,
  });
  return out.base64 ? { base64: out.base64, uri: out.uri } : null;
}
