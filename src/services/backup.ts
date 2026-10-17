/**
 * Backup on the phone: one folder granted once, one current file in it.
 *
 * ── ASKED ONCE, THEN SILENT ──────────────────────────────────────────────
 *
 * Android's folder picker (Storage Access Framework) hands back a tree URI
 * with a PERSISTABLE grant: expo-file-system takes it, Android keeps it
 * across restarts and app updates, and every later write needs no prompt.
 * Only uninstalling the app (or the user revoking it in settings) ends it,
 * and then the Summary card says so and offers to pick the folder again.
 *
 * ── AFTER EVERY CHANGE ───────────────────────────────────────────────────
 *
 * The log, chats and settings stores are watched; any change schedules one
 * write a moment later (so typing a chat or a burst of edits is one file, not
 * twenty). Writes are serialised: a new file is created first, and only once
 * it is fully written are the older backup files deleted, so a crash
 * mid-write never leaves the folder with nothing.
 */

import * as DocumentPicker from 'expo-document-picker';
import { readAsStringAsync, StorageAccessFramework as SAF } from 'expo-file-system/legacy';

import pkg from '../../package.json';
import { t } from '../i18n';
import {
  backupFileName,
  buildBackup,
  mergeById,
  parseBackup,
  serializeBackup,
  staleBackups,
  type Backup,
} from '../lib/backup';
import { resolveModel } from '../lib/models';
import { useChats } from '../state/chats';
import { useSettings } from '../state/settings';
import { useLog } from '../state/store';
import { saveApiKey } from './secrets';

const DEBOUNCE_MS = 1500;

function appVersion(): string {
  return pkg.version;
}

function currentBackup(now: number): Backup {
  const s = useSettings.getState();
  return buildBackup({
    entries: useLog.getState().entries,
    chats: useChats.getState().chats,
    settings: { consumption: s.consumption, geminiModel: s.geminiModel },
    apiKey: s.apiKey,
    appVersion: appVersion(),
    now,
  });
}

/** Opens Android's folder picker. Returns false if the user backed out. */
export async function chooseBackupFolder(): Promise<boolean> {
  try {
    const res = await SAF.requestDirectoryPermissionsAsync();
    if (!res.granted) return false;
    useSettings.getState().set({ backupDirUri: res.directoryUri });
    await backupNow();
    return true;
  } catch {
    return false;
  }
}

let chain: Promise<unknown> = Promise.resolve();

/** Writes the backup now (queued behind any write in progress). */
export function backupNow(): Promise<boolean> {
  const run = chain.then(writeOnce, writeOnce);
  chain = run;
  return run;
}

async function writeOnce(): Promise<boolean> {
  const dir = useSettings.getState().backupDirUri;
  if (!dir) return false;
  const now = Date.now();
  const name = backupFileName(now);
  try {
    const uri = await SAF.createFileAsync(dir, name, 'application/json');
    await SAF.writeAsStringAsync(uri, serializeBackup(currentBackup(now)));
    const listed = await SAF.readDirectoryAsync(dir);
    for (const old of staleBackups(listed, uri)) {
      await SAF.deleteAsync(old, { idempotent: true }).catch(() => {});
    }
    useSettings.getState().set({ lastBackup: { at: now, ok: true, file: name } });
    return true;
  } catch {
    useSettings.getState().set({
      lastBackup: {
        at: now,
        ok: false,
        error: t('services.backup.writeFailed'),
      },
    });
    return false;
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
function schedule() {
  if (!useSettings.getState().backupDirUri) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void backupNow();
  }, DEBOUNCE_MS);
}

/** Starts watching the stores. Call once, after they have hydrated. */
export function startAutoBackup(): () => void {
  const unsubs = [
    useLog.subscribe((s, p) => s.entries !== p.entries && schedule()),
    useChats.subscribe((s, p) => s.chats !== p.chats && schedule()),
    useSettings.subscribe(
      (s, p) =>
        (s.consumption !== p.consumption ||
          s.geminiModel !== p.geminiModel ||
          s.apiKey !== p.apiKey) &&
        schedule(),
    ),
  ];
  return () => unsubs.forEach((u) => u());
}

export type PickedBackup = { ok: true; backup: Backup } | { ok: false; error?: string };

/** Lets the user pick a .json and checks it fully; nothing is changed yet. */
export async function pickBackupFile(): Promise<PickedBackup> {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/plain', '*/*'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return { ok: false };
    const text = await readAsStringAsync(res.assets[0].uri);
    return parseBackup(text);
  } catch {
    return { ok: false, error: t('services.backup.readFailed') };
  }
}

/** Applies a checked backup. Returns the counts for the confirmation. */
export async function applyBackup(b: Backup, mode: 'merge' | 'replace') {
  const log = useLog.getState();
  const chats = useChats.getState();
  let added = b.entries.length;
  let updated = 0;
  if (mode === 'replace') {
    log.setAll(b.entries);
    chats.setAll(b.chats);
  } else {
    const m = mergeById(log.entries, b.entries);
    log.setAll(m.items);
    chats.setAll(mergeById(chats.chats, b.chats).items);
    added = m.added;
    updated = m.updated;
  }
  const s = useSettings.getState();
  // Settings from the file fill in what this phone does not have; in Replace
  // mode the file wins outright.
  s.set({
    consumption: mode === 'replace' || !s.consumption ? b.settings.consumption : s.consumption,
    geminiModel:
      mode === 'replace' || !s.geminiModel ? resolveModel(b.settings.geminiModel) : s.geminiModel,
  });
  if (b.geminiApiKey && (mode === 'replace' || !s.apiKey)) await saveApiKey(b.geminiApiKey);
  return { added, updated, total: useLog.getState().entries.length };
}
