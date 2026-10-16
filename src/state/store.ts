/**
 * The log, persisted.
 *
 * One store, one list. Everything the screens show — range used, day groups,
 * weekly totals — is derived from `entries` by `src/lib`, so the only thing that
 * can ever be out of date is this array, and AsyncStorage holds exactly that.
 *
 * ── HYDRATION ────────────────────────────────────────────────────────────
 *
 * AsyncStorage is asynchronous, so for the first frames the store is empty
 * whether or not the user has a year of history. `hydrated` lets the UI tell
 * "empty log" from "not read yet" and avoid flashing the empty state. It flips
 * on success, on a first launch with nothing stored, and on a failed read too —
 * a spinner that never ends is worse than an empty list.
 *
 * `hydrated` is session state and is left out of what is written (`partialize`):
 * persisting `true` would make the next launch claim it had read before it had.
 *
 * ── A BAD BLOB IS AN EMPTY LOG, NOT A CRASH ──────────────────────────────
 *
 * A write cut off by the OS killing the app can leave anything on disk. `merge`
 * keeps only an array of objects that at least carry an id, a time and a kind;
 * the rest is dropped so one bad row does not cost the whole log.
 *
 * ── SELECTORS MUST BE STABLE ─────────────────────────────────────────────
 *
 * zustand 5 on React 19 compares selector results by identity, and a selector
 * that builds a new array every call (`s.entries.filter(...)`) re-renders
 * forever. Select `s.entries` itself and derive with `useMemo` in the component.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Entry } from '../types';

export const STORAGE_KEY = 'fuel-log/v1';

interface LogState {
  /** In no particular order — readers sort with `sortNewestFirst`. */
  entries: Entry[];
  hydrated: boolean;
  add: (e: Entry) => void;
  /** Replaces the entry with the same id; an unknown id is a no-op. */
  update: (e: Entry) => void;
  remove: (id: string) => void;
}

const KINDS = new Set(['trip', 'reading', 'refuel']);

/** Whatever was on disk → the entries worth keeping. */
export function sanitizeEntries(raw: unknown): Entry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is Entry =>
      typeof e === 'object' &&
      e !== null &&
      typeof (e as Entry).id === 'string' &&
      typeof (e as Entry).at === 'number' &&
      KINDS.has((e as Entry).kind),
  );
}

export const useLog = create<LogState>()(
  persist(
    (set) => ({
      entries: [],
      hydrated: false,
      add: (e) => set((s) => ({ entries: [e, ...s.entries.filter((x) => x.id !== e.id)] })),
      update: (e) =>
        set((s) =>
          s.entries.some((x) => x.id === e.id)
            ? { entries: s.entries.map((x) => (x.id === e.id ? e : x)) }
            : s,
        ),
      remove: (id) => set((s) => ({ entries: s.entries.filter((x) => x.id !== id) })),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ entries: state.entries }),
      // Nothing stored (first launch) keeps what is in memory; anything stored is
      // trusted only as far as `sanitizeEntries` vouches for it.
      merge: (persisted, current) =>
        persisted === undefined || persisted === null
          ? current
          : { ...current, entries: sanitizeEntries((persisted as { entries?: unknown }).entries) },
      // Called after every rehydrate — with nothing stored, and after an error too.
      onRehydrateStorage: () => () => {
        useLog.setState({ hydrated: true });
      },
    },
  ),
);

const selectEntries = (s: LogState) => s.entries;
const selectHydrated = (s: LogState) => s.hydrated;

/** The entries and whether they have been read yet — two stable selections, no new objects. */
export function useHydratedLog(): { entries: Entry[]; hydrated: boolean } {
  const entries = useLog(selectEntries);
  const hydrated = useLog(selectHydrated);
  return { entries, hydrated };
}
