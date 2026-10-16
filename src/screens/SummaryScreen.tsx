/**
 * The Summary tab: totals for a period, the fuel calculator, the per-day
 * breakdown, the editable refuel (spending) history, and the user's data.
 *
 * Periods are Week / Month / All / Custom. Custom shows FROM and TO day
 * steppers (FROM ≤ TO ≤ today) and ends at the start of the day after TO, so
 * TO is a whole day. Tiles, BY DAY, REFUELS and the empty state all follow
 * the selected period.
 *
 * Tiles draw the number large and the unit small, the way a dashboard does.
 * Per-day figures go through `summarize` over the FULL entry list with that
 * day's bounds (not over the day's entries alone), because range used is
 * measured from the previous reading, which may be on an earlier day.
 *
 * The calculator's price is not remembered (it changes at every pump); its
 * consumption is, because the per-trip cost estimates on the Log use it too.
 */

import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dayBounds, splitUnit } from '../components/format';
import { ChevronIcon, DropIcon } from '../components/icons';
import { Button, Segmented, Tap } from '../components/ui';
import { useNow } from '../components/useNow';
import { folderLabel } from '../lib/backup';
import {
  dayKey,
  dayLabel,
  formatTime,
  groupByDay,
  periodStart,
  sortNewestFirst,
  summarize,
} from '../lib/entries';
import {
  calculate,
  clampCustomRange,
  customPeriod,
  kmPerLiterFromRefuels,
  latestPricePerLiter,
  shiftDay,
  type CalcMode,
} from '../lib/fuel';
import { formatAmd, formatKm, formatLiters } from '../lib/numbers';
import { stationLine } from '../lib/stations';
import { applyBackup, backupNow, chooseBackupFolder, pickBackupFile } from '../services/backup';
import { useSettings } from '../state/settings';
import { useLog } from '../state/store';
import { colors, fonts, radius, spacing, TOUCH } from '../theme';
import type { Entry, RefuelEntry } from '../types';

type Period = 'week' | 'month' | 'all' | 'custom';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'all', label: 'All' },
  { value: 'custom', label: 'Custom' },
];
const MODES: { value: CalcMode; label: string }[] = [
  { value: 'km', label: 'Cost of km' },
  { value: 'amd', label: 'Km for AMD' },
];

export function SummaryScreen({
  onEdit,
  onAddRefuel,
}: {
  onEdit: (entry: Entry) => void;
  onAddRefuel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const entries = useLog((s) => s.entries);
  const now = useNow();
  const [period, setPeriod] = useState<Period>('week');
  // Custom starts as this month so far; not remembered between launches.
  const [custom, setCustom] = useState<[number, number]>(() => [
    periodStart('month', Date.now()),
    shiftDay(Date.now(), 0),
  ]);

  const [from, to] = useMemo<[number, number]>(
    () =>
      period === 'custom'
        ? customPeriod(custom[0], custom[1])
        : [periodStart(period, now), Infinity],
    [period, custom, now],
  );
  const total = useMemo(() => summarize(entries, from, to), [entries, from, to]);
  const inPeriod = useMemo(
    () => entries.filter((e) => e.at >= from && e.at < to),
    [entries, from, to],
  );
  const days = useMemo(
    () =>
      groupByDay(inPeriod, now).map((g) => {
        const [start, end] = dayBounds(g.entries[0].at);
        return { key: g.key, label: g.label, summary: summarize(entries, start, end) };
      }),
    [entries, inPeriod, now],
  );
  const refuels = useMemo(
    () => sortNewestFirst(inPeriod).filter((e): e is RefuelEntry => e.kind === 'refuel'),
    [inPeriod],
  );

  const tiles: { label: string; value: string; accent?: boolean; full?: boolean }[] = [
    { label: 'Driven', value: formatKm(total.distanceKm) },
    { label: 'Trips', value: String(total.trips) },
    { label: 'Range used', value: formatKm(total.rangeUsedKm), accent: true },
    { label: 'Refuels', value: String(total.refuels) },
    { label: 'Fuel', value: formatLiters(total.liters) },
    { label: 'Spent', value: formatAmd(total.spentAmd) },
  ];
  if (total.liters > 0) {
    tiles.push({
      label: 'Avg price',
      value: `${formatAmd(total.spentAmd / total.liters)}/L`,
      full: true,
    });
  }

  const stepDay = (which: 0 | 1, dir: 1 | -1) =>
    setCustom((c) => {
      const next: [number, number] = [c[0], c[1]];
      next[which] = shiftDay(c[which], dir);
      // Moving FROM past TO is refused rather than dragging TO along.
      if (which === 0 && next[0] > next[1]) return c;
      if (which === 1 && next[1] < next[0]) return c;
      return clampCustomRange(next[0], next[1], Date.now());
    });

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Summary</Text>
      <Segmented options={PERIODS} value={period} onChange={setPeriod} />

      {period === 'custom' ? (
        <View style={styles.rangeRow}>
          {(['From', 'To'] as const).map((label, i) => (
            <View key={label} style={styles.rangeCol}>
              <Text style={styles.label}>{label}</Text>
              <View style={styles.stepper}>
                <Tap
                  onPress={() => stepDay(i as 0 | 1, -1)}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} one day earlier`}
                  style={styles.stepBtn}
                >
                  <Text style={styles.stepGlyph}>−</Text>
                </Tap>
                <Text style={styles.stepVal} numberOfLines={1} adjustsFontSizeToFit>
                  {dayLabel(dayKey(custom[i]), now)}
                </Text>
                <Tap
                  onPress={() => stepDay(i as 0 | 1, 1)}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} one day later`}
                  style={styles.stepBtn}
                >
                  <Text style={styles.stepGlyph}>+</Text>
                </Tap>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.grid}>
        {tiles.map((t) => {
          const [num, unit] = /[A-Za-z]/.test(t.value) ? splitUnit(t.value) : [t.value, ''];
          return (
            <View key={t.label} style={[styles.tile, t.full && styles.tileFull]}>
              <Text style={styles.label}>{t.label}</Text>
              <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
                <Text style={[styles.tileNum, t.accent && { color: colors.accent }]}>{num}</Text>
                {unit ? <Text style={styles.tileUnit}> {unit}</Text> : null}
              </Text>
            </View>
          );
        })}
      </View>

      <Calculator entries={entries} />

      {days.length > 0 ? (
        <>
          <Text style={[styles.label, styles.section]}>By day</Text>
          <View style={styles.list}>
            {days.map((d, i) => (
              <View key={d.key} style={[styles.dayRow, i > 0 && styles.divider]}>
                <Text style={styles.dayLabel}>{d.label}</Text>
                <View style={styles.dayNums}>
                  <Text style={styles.dayKm}>{formatKm(d.summary.distanceKm)}</Text>
                  {d.summary.rangeUsedKm > 0 ? (
                    <Text style={styles.dayUsed}>−{formatKm(d.summary.rangeUsedKm)} range</Text>
                  ) : null}
                  {d.summary.spentAmd > 0 ? (
                    <Text style={styles.daySpent}>{formatAmd(d.summary.spentAmd)}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.empty}>Nothing logged in this period yet.</Text>
      )}

      <View style={styles.sectionHead}>
        <Text style={[styles.label, styles.section]}>Refuels</Text>
      </View>
      {refuels.length > 0 ? (
        <View style={styles.list}>
          {refuels.map((r, i) => (
            <Tap
              key={r.id}
              onPress={() => onEdit(r)}
              accessibilityRole="button"
              accessibilityHint="Edit this refuel"
              style={[styles.refuelRow, i > 0 && styles.divider]}
            >
              <DropIcon />
              <View style={styles.refuelBody}>
                <Text style={styles.refuelWhen}>
                  {dayLabel(dayKey(r.at), now)} · {formatTime(r.at)}
                </Text>
                <Text style={styles.refuelMain}>
                  {formatLiters(r.liters)} · {formatAmd(r.priceAmd)}
                </Text>
                {stationLine(r) ? (
                  <Text style={styles.refuelStation} numberOfLines={1}>
                    {stationLine(r)}
                  </Text>
                ) : null}
              </View>
              <ChevronIcon />
            </Tap>
          ))}
        </View>
      ) : (
        <Text style={styles.muted}>No refuels in this period.</Text>
      )}
      <Tap onPress={onAddRefuel} accessibilityRole="button" style={styles.addRefuel}>
        <Text style={styles.addRefuelText}>+ Add refuel</Text>
      </Tap>

      <DataCard />
    </ScrollView>
  );
}

function Calculator({ entries }: { entries: Entry[] }) {
  const consumption = useSettings((s) => s.consumption);
  const setSettings = useSettings((s) => s.set);
  const [mode, setMode] = useState<CalcMode>('km');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');

  const lastPrice = useMemo(() => latestPricePerLiter(entries), [entries]);
  const derived = useMemo(() => kmPerLiterFromRefuels(entries), [entries]);
  const out = calculate({ mode, amount, price, consumption, entries });

  return (
    <>
      <Text style={[styles.label, styles.section]}>Fuel calculator</Text>
      <View style={styles.calc}>
        <Segmented
          options={MODES}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setAmount('');
          }}
          dark
        />
        <Text style={styles.calcHint}>
          {mode === 'km' ? 'What a distance costs in fuel.' : 'How far a fuel budget takes you.'}
        </Text>
        <CalcInput
          label={mode === 'km' ? 'Distance' : 'Money'}
          suffix={mode === 'km' ? 'km' : 'AMD'}
          value={amount}
          onChange={setAmount}
          placeholder={mode === 'km' ? '100' : '10000'}
          big
        />
        <View style={styles.calcPair}>
          <CalcInput
            label="Price"
            suffix="AMD/L"
            value={price}
            onChange={setPrice}
            placeholder={lastPrice ? `last ${formatAmd(lastPrice).replace(/ AMD$/, '')}` : 'AMD/L'}
            a11y="Price per litre"
          />
          <CalcInput
            label="Consumption"
            suffix="L/100 km"
            value={consumption}
            onChange={(v) => setSettings({ consumption: v })}
            placeholder={
              derived ? `${(Math.round((100 / derived) * 10) / 10).toString()} from log` : ''
            }
            a11y="Consumption, litres per 100 km"
          />
        </View>
        <View style={styles.hr} />
        {out.ok ? (
          <View style={styles.resultBlock}>
            <Text numberOfLines={1} adjustsFontSizeToFit>
              <Text style={styles.result}>
                ≈ {out.unit === 'AMD' ? formatAmd(out.result).replace(/ AMD$/, '') : out.result}
              </Text>
              <Text style={styles.resultUnit}> {out.unit}</Text>
            </Text>
            <Text style={styles.resultDetail}>
              {formatLiters(out.liters)} at {formatAmd(out.price)}/L
            </Text>
          </View>
        ) : (
          <Text style={styles.muted}>{out.missing}</Text>
        )}
      </View>
    </>
  );
}

function CalcInput({
  label,
  suffix,
  value,
  onChange,
  placeholder,
  big = false,
  a11y,
}: {
  label: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  big?: boolean;
  a11y?: string;
}) {
  return (
    <View style={[styles.calcField, !big && styles.flex]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.calcBox}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          keyboardType="decimal-pad"
          accessibilityLabel={a11y ?? label}
          style={[styles.calcInput, big && styles.calcInputBig]}
        />
        <Text style={big ? styles.calcSuffixBig : styles.calcSuffix} numberOfLines={1}>
          {suffix}
        </Text>
      </View>
    </View>
  );
}

function DataCard() {
  const dir = useSettings((s) => s.backupDirUri);
  const last = useSettings((s) => s.lastBackup);
  const [busy, setBusy] = useState(false);

  const exportNow = async () => {
    setBusy(true);
    const ok = dir ? await backupNow() : await chooseBackupFolder();
    setBusy(false);
    const status = useSettings.getState().lastBackup;
    if (ok && status?.ok)
      Alert.alert(
        'Data saved',
        `${status.file}\nin ${folderLabel(useSettings.getState().backupDirUri ?? '')}`,
      );
    else if (dir || useSettings.getState().backupDirUri)
      Alert.alert('Not saved', status && !status.ok ? status.error : 'Try again.');
  };

  const importNow = async () => {
    const picked = await pickBackupFile();
    if (!picked.ok) {
      if (picked.error) Alert.alert('Import failed', picked.error);
      return;
    }
    const b = picked.backup;
    const when = b.exportedAt ? new Date(b.exportedAt) : undefined;
    const whenText =
      when && !Number.isNaN(when.getTime())
        ? ` from ${dayLabel(dayKey(when.getTime()), Date.now())} ${formatTime(when.getTime())}`
        : '';
    const run = async (mode: 'merge' | 'replace') => {
      const r = await applyBackup(b, mode);
      Alert.alert(
        'Imported',
        mode === 'merge'
          ? `${r.added} added, ${r.updated} updated. ${r.total} entries now.`
          : `Replaced. ${r.total} entries now.`,
      );
    };
    Alert.alert(
      'Import this backup?',
      `Backup${whenText}: ${b.entries.length} entries, ${b.chats.length} chats.\n\nMerge adds new entries and updates changed ones; nothing is deleted.\nReplace makes this phone match the file exactly.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: () => void run('replace') },
        { text: 'Merge', onPress: () => void run('merge') },
      ],
    );
  };

  return (
    <>
      <Text style={[styles.label, styles.section]}>Your data</Text>
      <View style={styles.calc}>
        <Text style={styles.dataText}>
          {dir
            ? `Auto-backup is on. Every change is saved to ${folderLabel(dir)}, replacing the previous file.`
            : 'Auto-backup is off. Pick a folder once and every change is saved there as one JSON file.'}
        </Text>
        {last ? (
          <Text style={[styles.muted, !last.ok && { color: colors.danger }]}>
            {last.ok
              ? `Last saved ${dayLabel(dayKey(last.at), Date.now())} ${formatTime(last.at)} · ${last.file}`
              : last.error}
          </Text>
        ) : null}
        <View style={styles.calcPair}>
          <View style={styles.flex}>
            <Button label={busy ? 'Saving…' : 'Export data'} onPress={exportNow} />
          </View>
          <View style={styles.flex}>
            <Button label="Import data" variant="ghost" onPress={importNow} />
          </View>
        </View>
        <Tap
          onPress={() => void chooseBackupFolder()}
          accessibilityRole="button"
          style={styles.folderBtn}
        >
          <Text style={styles.folderText}>
            {dir ? 'Change backup folder' : 'Choose backup folder'}
          </Text>
        </Tap>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  flex: { flex: 1 },
  title: {
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
  },
  label: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  section: { marginTop: spacing.sm, marginBottom: -spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center' },
  rangeRow: { flexDirection: 'row', gap: spacing.md },
  rangeCol: { flex: 1, gap: 6, minWidth: 0 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  stepBtn: { width: TOUCH, height: 52, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { color: colors.accent, fontFamily: fonts.ui, fontSize: 24, fontWeight: '600' },
  stepVal: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 15,
    fontWeight: '700',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
    minHeight: 92,
  },
  tileFull: { flexBasis: '100%' },
  tileValue: { lineHeight: 36 },
  tileNum: {
    color: colors.text,
    fontFamily: fonts.num,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  tileUnit: { color: colors.muted, fontFamily: fonts.ui, fontSize: 15, fontWeight: '600' },
  calc: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  calcHint: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    marginHorizontal: spacing.xs,
    marginVertical: -6,
  },
  calcPair: { flexDirection: 'row', gap: spacing.md },
  calcField: { gap: 6, minWidth: 0 },
  calcBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 56,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  calcInput: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontFamily: fonts.num,
    fontSize: 16,
    fontWeight: '500',
    paddingVertical: spacing.md,
  },
  calcInputBig: { fontSize: 24, fontWeight: '700' },
  calcSuffix: { color: colors.muted, fontFamily: fonts.ui, fontSize: 13, fontWeight: '600' },
  calcSuffixBig: { color: colors.muted, fontFamily: fonts.ui, fontSize: 16, fontWeight: '600' },
  hr: { height: 1, backgroundColor: colors.border },
  resultBlock: { gap: spacing.xs },
  result: {
    color: colors.accent,
    fontFamily: fonts.num,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '700',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  resultUnit: { color: colors.muted, fontFamily: fonts.ui, fontSize: 16, fontWeight: '600' },
  resultDetail: {
    color: colors.muted,
    fontFamily: fonts.num,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
  },
  muted: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
  },
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
  },
  dayLabel: {
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  dayNums: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.md,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  dayKm: {
    color: colors.text,
    fontFamily: fonts.num,
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  dayUsed: { color: colors.accent, fontFamily: fonts.num, fontSize: 14, fontWeight: '700' },
  daySpent: { color: colors.muted, fontFamily: fonts.num, fontSize: 14, fontWeight: '600' },
  empty: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  refuelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  refuelBody: { flex: 1, gap: 2 },
  refuelWhen: { color: colors.muted, fontFamily: fonts.ui, fontSize: 13, fontWeight: '600' },
  refuelMain: { color: colors.text, fontFamily: fonts.num, fontSize: 16, fontWeight: '600' },
  refuelStation: { color: colors.muted, fontFamily: fonts.ui, fontSize: 13, fontWeight: '500' },
  addRefuel: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -spacing.sm,
  },
  addRefuelText: { color: colors.accent, fontFamily: fonts.ui, fontSize: 15, fontWeight: '700' },
  dataText: { color: colors.text, fontFamily: fonts.ui, fontSize: 15, lineHeight: 21 },
  folderBtn: { minHeight: TOUCH, justifyContent: 'center' },
  folderText: { color: colors.accent, fontFamily: fonts.ui, fontSize: 15, fontWeight: '700' },
});
