import { afterEach, describe, expect, it } from 'vitest';

import { setLang } from '../i18n';

import {
  backupFileName,
  buildBackup,
  folderLabel,
  isBackupFile,
  mergeById,
  parseBackup,
  serializeBackup,
  staleBackups,
} from './backup';
import { newChat } from './chat';
import { at, realNotes, reading, refuel, trip } from './entries.fixtures';

const sample = () =>
  buildBackup({
    entries: [
      ...realNotes,
      {
        ...refuel('f', at(16, 9, 0), 30, 15000),
        station: 'Max Petrol',
        address: 'Komitas 5',
        grade: '92' as const,
      },
      trip('g', at(16, 10, 0), 'a', 'b', { track: [{ lat: 40.1, lon: 44.5, t: 1 }] }),
    ],
    chats: [{ ...newChat('c1', 5), messages: [{ id: 'm', role: 'user', text: 'hi', at: 5 }] }],
    settings: { consumption: '8', geminiModel: 'gemini-3.8-flash' },
    apiKey: 'AIza-test',
    appVersion: '1.1.0',
    now: at(16, 19, 5),
  });

describe('backup round trip', () => {
  it('everything survives serialise → parse', () => {
    const b = sample();
    const parsed = parseBackup(serializeBackup(b));
    expect(parsed).toEqual({ ok: true, backup: b });
  });

  it('is human-readable (indented)', () => {
    expect(serializeBackup(sample())).toContain('\n  "entries": [');
  });
});

describe('parseBackup rejects what is not ours', () => {
  it('not JSON', () => {
    expect(parseBackup('hello')).toEqual({ ok: false, error: 'This file is not valid JSON.' });
  });
  it('some other JSON', () => {
    expect(parseBackup('{"entries":[]}').ok).toBe(false);
    expect(parseBackup('[]').ok).toBe(false);
    expect(parseBackup('null').ok).toBe(false);
  });
  it('a newer format', () => {
    const r = parseBackup(JSON.stringify({ ...sample(), format: 99 }));
    expect(r).toEqual({
      ok: false,
      error: 'This backup is from a newer Fuel Log. Update the app first.',
    });
  });
  it('bad rows are dropped, good ones kept', () => {
    const b = { ...sample(), entries: [reading('r', 1, 100), { id: 3 }, null, 'x'] };
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok && r.backup.entries).toEqual([reading('r', 1, 100)]);
  });
  it('missing chats / settings / key default sensibly (older exports)', () => {
    const r = parseBackup(JSON.stringify({ app: 'fuel-log', format: 1, entries: [] }));
    expect(r.ok && r.backup).toMatchObject({
      chats: [],
      settings: { consumption: '', geminiModel: '' },
      geminiApiKey: '',
    });
  });
});

describe('mergeById', () => {
  it('adds new, replaces same id, keeps the rest, counts both', () => {
    const phone = [reading('a', 1, 100), reading('b', 2, 90)];
    const file = [reading('b', 2, 80), reading('c', 3, 70)];
    const m = mergeById(phone, file);
    expect(m.items).toEqual([reading('a', 1, 100), reading('b', 2, 80), reading('c', 3, 70)]);
    expect(m).toMatchObject({ added: 1, updated: 1 });
  });
  it('an identical entry is not counted as updated', () => {
    expect(mergeById([reading('a', 1, 100)], [reading('a', 1, 100)])).toMatchObject({
      added: 0,
      updated: 0,
    });
  });
});

describe('backup file names', () => {
  it('carries the local date-time', () => {
    expect(backupFileName(at(16, 19, 5))).toBe('fuel-log-backup-2026-10-16_19-05-00.json');
  });

  it('recognises our files by name, plain or as SAF content URIs', () => {
    expect(isBackupFile('fuel-log-backup-2026-10-16_19-05-00.json')).toBe(true);
    expect(
      isBackupFile(
        'content://com.android.externalstorage.documents/tree/primary%3AFuelLog/document/primary%3AFuelLog%2Ffuel-log-backup-2026-10-16_19-05-00.json',
      ),
    ).toBe(true);
    expect(isBackupFile('fuel-log-backup-2026-10-16_19-05-00 (1).json')).toBe(true);
    expect(isBackupFile('notes.json')).toBe(false);
    expect(isBackupFile('my-fuel-log-backup-2026-10-16_19-05-00.json.txt')).toBe(false);
  });

  it('deletes only older backups, never the new one or other files', () => {
    const dir = 'content://x/document/primary%3AFuelLog%2F';
    const keep = `${dir}fuel-log-backup-2026-10-16_19-05-00.json`;
    const old = `${dir}fuel-log-backup-2026-10-15_08-00-00.json`;
    const other = `${dir}photo.jpg`;
    expect(staleBackups([keep, old, other], keep)).toEqual([old]);
  });
});

describe('folderLabel', () => {
  it('shows the folder path, not the URI', () => {
    expect(
      folderLabel(
        'content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FFuelLog',
      ),
    ).toBe('Documents/FuelLog');
    expect(folderLabel('content://com.android.externalstorage.documents/tree/primary%3A')).toBe(
      'Internal storage',
    );
    expect(folderLabel('weird')).toBe('weird');
  });
});

describe('parseBackup in Russian', () => {
  afterEach(() => setLang('en'));

  it('explains the error in the current language', () => {
    setLang('ru');
    expect(parseBackup('hello')).toEqual({ ok: false, error: 'Файл не является корректным JSON.' });
  });
});
