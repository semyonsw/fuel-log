import { describe, expect, it } from 'vitest';

import {
  backupFileName,
  buildBackup,
  folderLabel,
  importedSettings,
  isBackupFile,
  mergeById,
  parseBackup,
  serializeBackup,
  staleBackups,
} from './backup';
import { at, realNotes, reading, refuel, trip } from './entries.fixtures';

const sample = () =>
  buildBackup({
    entries: [
      ...realNotes,
      refuel('f', at(16, 9, 0), 30, 15000, 400),
      trip('g', at(16, 10, 0), 'a', 'b', { track: [{ lat: 40.1, lon: 44.5, t: 1 }] }),
    ],
    settings: { consumption: '8' },
    appVersion: '1.8.0',
    now: at(16, 19, 5),
  });

/** What 1.7.x wrote: AI chats, a key, a model, budgets, and the two retired kinds. */
const v17File = () => ({
  app: 'fuel-log',
  format: 1,
  exportedAt: '2026-10-16T15:05:00.000Z',
  appVersion: '1.7.0',
  entries: [
    ...realNotes,
    {
      ...refuel('f', at(16, 9, 0), 30, 15000),
      station: 'Max Petrol',
      address: 'Komitas 5',
      grade: '92',
      odometerKm: 81234,
    },
    {
      id: 's',
      at: at(16, 11, 0),
      kind: 'service',
      category: 'oil',
      costAmd: 25000,
      odometerKm: 81300,
      remindKm: 10000,
    },
    { id: 'x', at: at(16, 12, 0), kind: 'expense', category: 'wash', amountAmd: 3000 },
  ],
  chats: [{ id: 'c1', title: '', messages: [{ id: 'm', role: 'user', text: 'hi', at: 5 }] }],
  geminiApiKey: 'AIza-test',
  settings: {
    consumption: '8',
    geminiModel: 'gemini-3.8-flash',
    fuelBudget: '60000',
    expenseBudget: '20000',
    language: 'ru',
  },
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

describe('parseBackup of a 1.7.x file', () => {
  const r = parseBackup(JSON.stringify(v17File()));
  if (!r.ok) throw new Error('a 1.7.x backup must still import');

  it('keeps only trips, readings and refuels', () => {
    expect(r.backup.entries.map((e) => e.id)).toEqual([...realNotes.map((e) => e.id), 'f']);
    expect(new Set(r.backup.entries.map((e) => e.kind))).toEqual(
      new Set(['trip', 'reading', 'refuel']),
    );
  });

  it('keeps the refuel without its station, address, grade or odometer', () => {
    expect(r.backup.entries.find((e) => e.id === 'f')).toEqual(
      refuel('f', at(16, 9, 0), 30, 15000),
    );
  });

  it('carries only consumption as settings, and no chats or key', () => {
    expect(r.backup.settings).toEqual({ consumption: '8' });
    expect(Object.keys(r.backup).sort()).toEqual(
      ['app', 'appVersion', 'entries', 'exportedAt', 'format', 'settings'].sort(),
    );
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
  it('missing settings default sensibly (older exports)', () => {
    const r = parseBackup(JSON.stringify({ app: 'fuel-log', format: 1, entries: [] }));
    expect(r.ok && r.backup).toMatchObject({
      exportedAt: '',
      appVersion: '',
      settings: { consumption: '' },
    });
  });
});

describe('importedSettings', () => {
  it('replace: the file wins, even with a blank', () => {
    expect(importedSettings({ consumption: '7' }, { consumption: '8' }, 'replace')).toEqual({
      consumption: '8',
    });
    expect(importedSettings({ consumption: '7' }, { consumption: '' }, 'replace')).toEqual({
      consumption: '',
    });
  });

  it('merge: the file only fills what the phone has blank', () => {
    expect(importedSettings({ consumption: '7' }, { consumption: '8' }, 'merge')).toEqual({
      consumption: '7',
    });
    expect(importedSettings({ consumption: '' }, { consumption: '8' }, 'merge')).toEqual({
      consumption: '8',
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
