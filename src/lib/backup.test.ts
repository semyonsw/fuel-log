import { describe, expect, it } from 'vitest';

import {
  backupFileName,
  buildBackup,
  canPruneBackups,
  folderLabel,
  importedSettings,
  isBackupFile,
  mergeById,
  mergeChats,
  parseBackup,
  serializeBackup,
  staleBackups,
} from './backup';
import { newChat, type Chat } from './chat';
import { at, realNotes, reading, refuel, trip } from './entries.fixtures';

const sample = () =>
  buildBackup({
    entries: [
      ...realNotes,
      refuel('f', at(16, 9, 0), 30, 15000, 400),
      trip('g', at(16, 10, 0), 'a', 'b', { track: [{ lat: 40.1, lon: 44.5, t: 1 }] }),
    ],
    chats: [{ ...newChat('c1', 5), messages: [{ id: 'm', role: 'user', text: 'hi', at: 5 }] }],
    settings: { consumption: '8', geminiModel: 'gemini-3.8-flash' },
    apiKey: 'AIza-test',
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
  chats: [
    {
      id: 'c1',
      title: 'Range',
      createdAt: 5,
      updatedAt: 5,
      messages: [{ id: 'm', role: 'user', text: 'hi', at: 5 }],
    },
  ],
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

  it('brings back the chats, the model and the key, and drops budgets and language', () => {
    expect(r.backup.chats?.map((c) => c.id)).toEqual(['c1']);
    expect(r.backup.chats?.[0].messages.map((m) => m.text)).toEqual(['hi']);
    expect(r.backup.geminiApiKey).toBe('AIza-test');
    expect(r.backup.settings).toEqual({ consumption: '8', geminiModel: 'gemini-3.8-flash' });
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
  it('missing chats / settings / key default sensibly (older and 2.0 exports)', () => {
    const r = parseBackup(JSON.stringify({ app: 'fuel-log', format: 1, entries: [] }));
    expect(r.ok && r.backup).toMatchObject({
      exportedAt: '',
      appVersion: '',
      settings: {},
      geminiApiKey: '',
    });
  });
});

describe('parseBackup of a 2.0.0 file (no chats, no model)', () => {
  const v20File = {
    app: 'fuel-log',
    format: 1,
    exportedAt: '2026-11-01T10:00:00.000Z',
    appVersion: '2.0.0',
    entries: [reading('r', 1, 100)],
    settings: { consumption: '8' },
  };
  const r = parseBackup(JSON.stringify(v20File));
  if (!r.ok) throw new Error('a 2.0.0 backup must import');

  it('leaves chats undefined, not empty, so Replace cannot wipe them', () => {
    expect(r.backup.chats).toBeUndefined();
    expect('chats' in r.backup).toBe(false);
  });

  it('leaves the model undefined and keeps the consumption', () => {
    expect(r.backup.settings).toEqual({ consumption: '8' });
  });

  it('an explicit empty chat list is still a list', () => {
    const empty = parseBackup(JSON.stringify({ ...v20File, chats: [] }));
    expect(empty.ok && empty.backup.chats).toEqual([]);
  });
});

describe('importedSettings', () => {
  const phone = { consumption: '7', geminiModel: 'a' };
  const file = { consumption: '8', geminiModel: 'b' };

  it('replace: the file wins, even with a blank', () => {
    expect(importedSettings(phone, file, 'replace')).toEqual(file);
    expect(importedSettings(phone, { consumption: '', geminiModel: '' }, 'replace')).toEqual({
      consumption: '',
      geminiModel: '',
    });
  });

  it('a setting the file does not carry keeps the phone value, in both modes', () => {
    expect(importedSettings(phone, { consumption: '8' }, 'replace')).toEqual({
      consumption: '8',
      geminiModel: 'a',
    });
    expect(importedSettings(phone, {}, 'merge')).toEqual(phone);
  });

  it('merge: the file only fills what the phone has blank', () => {
    expect(importedSettings(phone, file, 'merge')).toEqual(phone);
    expect(importedSettings({ consumption: '', geminiModel: 'a' }, file, 'merge')).toEqual({
      consumption: '8',
      geminiModel: 'a',
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

describe('mergeChats', () => {
  const chat = (id: string, updatedAt: number, extra: Partial<Chat> = {}): Chat => ({
    ...newChat(id, 0),
    updatedAt,
    ...extra,
  });

  it('keeps the phone copy when it was continued after the backup', () => {
    const phone = [chat('a', 20, { title: 'phone' })];
    const m = mergeChats(phone, [chat('a', 10, { title: 'file' })]);
    expect(m.items).toEqual(phone);
    expect(m).toMatchObject({ added: 0, updated: 0 });
  });

  it('takes the file copy when it is newer', () => {
    const file = chat('a', 30, { title: 'file' });
    const m = mergeChats([chat('a', 20, { title: 'phone' })], [file]);
    expect(m.items).toEqual([file]);
    expect(m).toMatchObject({ added: 0, updated: 1 });
  });

  it('on a tie keeps the phone copy (approvals do not move updatedAt)', () => {
    const msg = { id: 'm', role: 'model' as const, text: 'ok', at: 10 };
    const phone = chat('a', 10, { messages: [{ ...msg, savedIds: ['e1'] }] });
    const m = mergeChats([phone], [chat('a', 10, { messages: [msg] })]);
    expect(m.items).toEqual([phone]);
  });

  it('adds chats only in the file', () => {
    const m = mergeChats([chat('a', 1)], [chat('b', 2)]);
    expect(m.items.map((c) => c.id)).toEqual(['a', 'b']);
    expect(m.added).toBe(1);
  });
});

describe('canPruneBackups', () => {
  it('prunes normally when the keystore was read', () => {
    expect(canPruneBackups('', false)).toBe(true);
    expect(canPruneBackups('AIza', false)).toBe(true);
  });
  it('keeps older files while an unreadable keystore left the key blank', () => {
    expect(canPruneBackups('', true)).toBe(false);
  });
  it('prunes again once a key is known this session', () => {
    expect(canPruneBackups('AIza', true)).toBe(true);
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
