/**
 * The backup file: everything the user put into the app, as one JSON file.
 *
 * ── WHAT IS IN IT ────────────────────────────────────────────────────────
 *
 * Entries, AI chats (text only — photos are never kept), the calculator's
 * remembered consumption, the chosen model, and the Gemini API key. The key
 * is in plain text because the user asked for a backup that restores a fresh
 * install completely; whoever has the file can use the key.
 *
 * ── ONE FILE, ALWAYS THE NEWEST ──────────────────────────────────────────
 *
 * Auto-backup writes `fuel-log-backup-YYYY-MM-DD_HH-mm-ss.json` after every
 * change and then deletes the older backup files in the folder, so the folder
 * holds exactly one current backup with its time in the name. Only files
 * matching that pattern are ever deleted — anything else the user keeps in
 * the folder is left alone.
 *
 * ── IMPORT CHECKS BEFORE IT TOUCHES ANYTHING ─────────────────────────────
 *
 * A picked file can be anything. It is parsed and sanitised in full first;
 * only a file that is recognisably a Fuel Log backup gets as far as the
 * Merge / Replace question.
 */

import type { Entry } from '../types';
import { sanitizeChats, type Chat } from './chat';
import { sanitizeEntries } from './sanitize';

export const BACKUP_APP = 'fuel-log';
export const BACKUP_FORMAT = 1;

export type BackupSettings = { consumption: string; geminiModel: string };

export type Backup = {
  app: typeof BACKUP_APP;
  format: number;
  exportedAt: string;
  appVersion: string;
  entries: Entry[];
  chats: Chat[];
  settings: BackupSettings;
  geminiApiKey: string;
};

export function buildBackup(input: {
  entries: Entry[];
  chats: Chat[];
  settings: BackupSettings;
  apiKey: string;
  appVersion: string;
  now: number;
}): Backup {
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    exportedAt: new Date(input.now).toISOString(),
    appVersion: input.appVersion,
    entries: input.entries,
    chats: input.chats,
    settings: input.settings,
    geminiApiKey: input.apiKey,
  };
}

/** Two-space indented, so the file is readable in any text viewer. */
export function serializeBackup(b: Backup): string {
  return `${JSON.stringify(b, null, 2)}\n`;
}

export type ParsedBackup = { ok: true; backup: Backup } | { ok: false; error: string };

export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  const o = raw as Partial<Backup> | null;
  if (typeof o !== 'object' || o === null || o.app !== BACKUP_APP || !Array.isArray(o.entries)) {
    return { ok: false, error: 'This is not a Fuel Log backup file.' };
  }
  if (typeof o.format !== 'number' || o.format > BACKUP_FORMAT) {
    return { ok: false, error: 'This backup is from a newer Fuel Log. Update the app first.' };
  }
  const s = (o.settings ?? {}) as Partial<BackupSettings>;
  return {
    ok: true,
    backup: {
      app: BACKUP_APP,
      format: o.format,
      exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : '',
      appVersion: typeof o.appVersion === 'string' ? o.appVersion : '',
      entries: sanitizeEntries(o.entries),
      chats: sanitizeChats(o.chats),
      settings: {
        consumption: typeof s.consumption === 'string' ? s.consumption : '',
        geminiModel: typeof s.geminiModel === 'string' ? s.geminiModel : '',
      },
      geminiApiKey: typeof o.geminiApiKey === 'string' ? o.geminiApiKey : '',
    },
  };
}

/**
 * Merge by id: the file's version wins for ids on both sides, ids only on the
 * phone are kept, nothing is deleted. Counts are for the confirmation line.
 */
export function mergeById<T extends { id: string }>(
  current: T[],
  incoming: T[],
): { items: T[]; added: number; updated: number } {
  const byId = new Map(current.map((x) => [x.id, x]));
  let added = 0;
  let updated = 0;
  for (const x of incoming) {
    if (byId.has(x.id)) {
      if (JSON.stringify(byId.get(x.id)) !== JSON.stringify(x)) updated += 1;
    } else added += 1;
    byId.set(x.id, x);
  }
  return { items: [...byId.values()], added, updated };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `fuel-log-backup-2026-10-16_19-05-00.json`, local time; sorts by name = sorts by time. */
export function backupFileName(now: number): string {
  const d = new Date(now);
  return (
    `fuel-log-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.json`
  );
}

const BACKUP_NAME = /^fuel-log-backup-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(\s*\(\d+\))?\.json$/;

/**
 * Whether a file in the folder is one of ours. SAF lists content URIs whose
 * last segment is the URL-encoded document id ("primary%3AFuelLog%2Ffuel-log…"),
 * so the name is taken after the last "/" once decoded.
 */
export function isBackupFile(uriOrName: string): boolean {
  let s = uriOrName;
  try {
    s = decodeURIComponent(uriOrName);
  } catch {
    // keep the raw string
  }
  const last = s.slice(s.lastIndexOf('/') + 1);
  return BACKUP_NAME.test(last.slice(last.lastIndexOf(':') + 1));
}

/** The backup files to delete once `keepUri` has been written. */
export function staleBackups(listed: string[], keepUri: string): string[] {
  return listed.filter((u) => u !== keepUri && isBackupFile(u));
}

/** "content://…/tree/primary%3ADocuments%2FFuelLog" → "Documents/FuelLog" for the Summary card. */
export function folderLabel(treeUri: string): string {
  const m = /\/tree\/([^/]+)/.exec(treeUri);
  if (!m) return treeUri;
  let id = m[1];
  try {
    id = decodeURIComponent(id);
  } catch {
    // keep encoded
  }
  const path = id.slice(id.indexOf(':') + 1);
  return path || 'Internal storage';
}
