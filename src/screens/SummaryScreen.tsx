/**
 * The Summary tab: totals for a period, the fuel calculator, this month's
 * budgets, the per-day breakdown, the editable spending history (refuels,
 * services, expenses), per-station and per-grade tables, and the trend
 * charts. (Export/import lives on Settings, in DataSection.)
 *
 * Periods are Today / Week / Month / All / Custom, opening on Today. Custom
 * shows FROM and TO day steppers (FROM ≤ TO ≤ today) and ends at the start of
 * the day after TO, so TO is a whole day. − / + repeat while held; tapping the day opens the
 * calendar, for jumps of weeks. Tiles, BY DAY, REFUELS and the empty state
 * all follow the selected period.
 *
 * Tiles draw the number large and the unit small, the way a dashboard does.
 * Per-day figures go through `summarize` over the FULL entry list with that
 * day's bounds (not over the day's entries alone), because range used is
 * measured from the previous reading, which may be on an earlier day.
 *
 * "Driving cost ≈" is what the period's trips cost in fuel, the sum of the
 * per-trip estimates the Log shows (`periodFuelCost`). It sits beside
 * "Spent", which is money paid at refuels: on most days nothing is paid, but
 * the driving still burned fuel.
 *
 * Money is split the way the budgets are: "Fuel spent" is refuels, "Other
 * costs" is services and expenses, "Total" the two together. Avg price stays
 * fuel money over litres.
 *
 * Two sections ignore the period on purpose. "This month" is about the
 * calendar month the budgets are for, whatever tab is picked, and "Trends"
 * look back over months and refuels, which a Today tab could not show.
 * Stations and grades follow the period like the lists.
 *
 * The calculator's price is not remembered (it changes at every pump). Its
 * consumption is the one set in Settings (the Log's per-trip estimates use it
 * too), or the log's own figure; a line under Price says which.
 */

import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openDayPicker } from '../components/DayPicker';
import { dayBounds, splitUnit } from '../components/format';
import { useHoldRepeat } from '../components/HoldRepeat';
import { MonthBars, TrendLine } from '../components/Charts';
import { ChevronIcon, DropIcon, ExpenseBadge, ServiceBadge } from '../components/icons';
import { Segmented, Tap } from '../components/ui';
import { useNow } from '../components/useNow';
import { plural, t, type StringKey } from '../i18n';
import { expenseLabel, serviceLabel } from '../lib/categories';
import { consumptionNote, consumptionSource } from '../lib/consumption';
import {
  dayKey,
  dayLabel,
  entryAmd,
  formatTime,
  groupByDay,
  isCost,
  periodStart,
  sortNewestFirst,
  summarize,
} from '../lib/entries';
import {
  calculate,
  clampCustomRange,
  customPeriod,
  effectiveKmPerLiter,
  kmPerLiterPoints,
  latestPricePerLiter,
  periodFuelCost,
  shiftDay,
  type CalcMode,
} from '../lib/fuel';
import { formatAmd, formatKm, formatLiters } from '../lib/numbers';
import {
  budgetStatus,
  gradeStats,
  monthBounds,
  monthForecast,
  monthlySpending,
  pricePerLiterPoints,
  spendingIn,
  stationStats,
  type RefuelGroup,
} from '../lib/stats';
import { gradeLabel, stationLine } from '../lib/stations';
import { useSettings } from '../state/settings';
import { useLog } from '../state/store';
import { colors, fonts, radius, spacing, TOUCH } from '../theme';
import type { Entry, ExpenseEntry, RefuelEntry, ServiceEntry } from '../types';

type Period = 'today' | 'week' | 'month' | 'all' | 'custom';
// Labels are looked up at render time so they follow the current language.
const PERIODS: Period[] = ['today', 'week', 'month', 'all', 'custom'];
const MODES: { value: CalcMode; key: StringKey }[] = [
  { value: 'km', key: 'summary.calc.modeKm' },
  { value: 'amd', key: 'summary.calc.modeAmd' },
];
// A tile value has a unit when it has anything besides digits, spaces and
// separators; checked this way (not [A-Za-z]) so "км" and "կմ" split too.
const HAS_UNIT = /[^\d\s.,\u2212-]/;
// Half a year of bars fits a 360dp phone with readable month names; a dozen
// refuels is a few months of prices without crowding the dots.
const TREND_MONTHS = 6;
const TREND_POINTS = 12;

type Spend = RefuelEntry | ServiceEntry | ExpenseEntry;

export function SummaryScreen({
  onEdit,
  onAddRefuel,
}: {
  onEdit: (entry: Entry) => void;
  onAddRefuel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const entries = useLog((s) => s.entries);
  const consumption = useSettings((s) => s.consumption);
  const now = useNow();
  const [period, setPeriod] = useState<Period>('today');
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
  const kmPerL = useMemo(() => effectiveKmPerLiter(entries, consumption), [entries, consumption]);
  const cost = useMemo(
    () => periodFuelCost(entries, from, to, kmPerL),
    [entries, from, to, kmPerL],
  );
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
  const spending = useMemo(
    () => sortNewestFirst(inPeriod).filter((e): e is Spend => e.kind === 'refuel' || isCost(e)),
    [inPeriod],
  );
  const stations = useMemo(() => stationStats(entries, from, to), [entries, from, to]);
  const grades = useMemo(() => gradeStats(entries, from, to), [entries, from, to]);

  const tiles: { label: string; value: string; accent?: boolean; full?: boolean }[] = [
    { label: t('summary.tile.driven'), value: formatKm(total.distanceKm) },
    { label: t('summary.tile.trips'), value: String(total.trips) },
    { label: t('summary.tile.rangeUsed'), value: formatKm(total.rangeUsedKm), accent: true },
    { label: t('summary.tile.refuels'), value: String(total.refuels) },
    { label: t('summary.tile.fuel'), value: formatLiters(total.liters) },
    { label: t('summary.tile.spent'), value: formatAmd(total.spentAmd) },
    { label: t('summary.tile.other'), value: formatAmd(total.otherAmd) },
    { label: t('summary.tile.total'), value: formatAmd(total.spentAmd + total.otherAmd) },
    {
      label: t('summary.tile.driveCost'),
      value: cost ? formatAmd(cost.amd) : '—',
      accent: true,
      full: true,
    },
  ];
  if (total.liters > 0) {
    tiles.push({
      label: t('summary.tile.avgPrice'),
      value: t('summary.perLiter', { amd: formatAmd(total.spentAmd / total.liters) }),
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

  // The calendar's bounds keep FROM ≤ TO ≤ today, so a pick never has to be
  // refused; the clamp is the same safety net stepDay uses.
  const pickDay = (which: 0 | 1) => {
    const today = shiftDay(Date.now(), 0);
    openDayPicker({
      day: custom[which],
      min: which === 1 ? custom[0] : undefined,
      max: which === 0 ? custom[1] : today,
      onPick: (day) =>
        setCustom((c) => {
          const next: [number, number] = [c[0], c[1]];
          next[which] = day;
          return clampCustomRange(next[0], next[1], Date.now());
        }),
    });
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>{t('summary.title')}</Text>
      <Segmented
        options={PERIODS.map((p) => ({ value: p, label: t(`summary.period.${p}`) }))}
        value={period}
        onChange={setPeriod}
      />

      {period === 'custom' ? (
        <View style={styles.rangeRow}>
          {[t('summary.range.from'), t('summary.range.to')].map((label, i) => (
            <View key={i} style={styles.rangeCol}>
              <Text style={styles.label}>{label}</Text>
              <View style={styles.stepper}>
                <StepBtn
                  dir={-1}
                  label={t('summary.range.earlier', { label })}
                  onStep={() => stepDay(i as 0 | 1, -1)}
                />
                <Tap
                  onPress={() => pickDay(i as 0 | 1)}
                  accessibilityRole="button"
                  accessibilityLabel={t('summary.range.pick', {
                    label,
                    day: dayLabel(dayKey(custom[i]), now),
                  })}
                  style={styles.stepValTap}
                >
                  <Text style={styles.stepVal} numberOfLines={1} adjustsFontSizeToFit>
                    {dayLabel(dayKey(custom[i]), now)}
                  </Text>
                </Tap>
                <StepBtn
                  dir={1}
                  label={t('summary.range.later', { label })}
                  onStep={() => stepDay(i as 0 | 1, 1)}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.grid}>
        {tiles.map((tile) => {
          const [num, unit] = HAS_UNIT.test(tile.value) ? splitUnit(tile.value) : [tile.value, ''];
          return (
            <View key={tile.label} style={[styles.tile, tile.full && styles.tileFull]}>
              {/* Shrinks rather than wraps: some translations are longer than a half tile. */}
              <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit>
                {tile.label}
              </Text>
              <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
                <Text style={[styles.tileNum, tile.accent && { color: colors.accent }]}>{num}</Text>
                {unit ? <Text style={styles.tileUnit}> {unit}</Text> : null}
              </Text>
            </View>
          );
        })}
      </View>

      <Calculator entries={entries} />

      <MonthCard entries={entries} now={now} />

      {days.length > 0 ? (
        <>
          <Text style={[styles.label, styles.section]}>{t('summary.byDay')}</Text>
          <View style={styles.list}>
            {days.map((d, i) => (
              <View key={d.key} style={[styles.dayRow, i > 0 && styles.divider]}>
                <View style={styles.dayTop}>
                  <Text style={styles.dayLabel} numberOfLines={1}>
                    {d.label}
                  </Text>
                  <Text style={styles.dayKm}>{formatKm(d.summary.distanceKm)}</Text>
                </View>
                {d.summary.rangeUsedKm > 0 || d.summary.spentAmd + d.summary.otherAmd > 0 ? (
                  <View style={styles.dayMore}>
                    {d.summary.rangeUsedKm > 0 ? (
                      <Text style={styles.dayUsed}>
                        {t('summary.dayRange', { km: formatKm(d.summary.rangeUsedKm) })}
                      </Text>
                    ) : null}
                    {d.summary.spentAmd + d.summary.otherAmd > 0 ? (
                      <Text style={styles.daySpent}>
                        {formatAmd(d.summary.spentAmd + d.summary.otherAmd)}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.empty}>{t('summary.empty')}</Text>
      )}

      <View style={styles.sectionHead}>
        <Text style={[styles.label, styles.section]}>{t('summary.spending')}</Text>
      </View>
      {spending.length > 0 ? (
        <View style={styles.list}>
          {spending.map((e, i) => (
            <Tap
              key={e.id}
              onPress={() => onEdit(e)}
              accessibilityRole="button"
              accessibilityHint={t('summary.entryHint')}
              style={[styles.refuelRow, i > 0 && styles.divider]}
            >
              {e.kind === 'refuel' ? (
                <DropIcon />
              ) : e.kind === 'service' ? (
                <ServiceBadge />
              ) : (
                <ExpenseBadge />
              )}
              <View style={styles.refuelBody}>
                <Text style={styles.refuelWhen}>
                  {dayLabel(dayKey(e.at), now)} · {formatTime(e.at)}
                </Text>
                <Text style={styles.refuelMain}>{spendMain(e)}</Text>
                {spendDetail(e) ? (
                  <Text style={styles.refuelStation} numberOfLines={1}>
                    {spendDetail(e)}
                  </Text>
                ) : null}
              </View>
              <ChevronIcon />
            </Tap>
          ))}
        </View>
      ) : (
        <Text style={styles.muted}>{t('summary.noSpending')}</Text>
      )}
      <Tap onPress={onAddRefuel} accessibilityRole="button" style={styles.addRefuel}>
        <Text style={styles.addRefuelText}>{t('summary.addRefuel')}</Text>
      </Tap>

      {stations.length > 0 ? (
        <>
          <Text style={[styles.label, styles.section]}>{t('stats.stations')}</Text>
          <GroupTable
            rows={stations.map((g) => ({ ...g, title: g.name ?? t('stats.noStation') }))}
            now={now}
          />
        </>
      ) : null}
      {grades.length > 0 ? (
        <>
          <Text style={[styles.label, styles.section]}>{t('stats.grades')}</Text>
          <GroupTable
            rows={grades.map((g) => ({
              ...g,
              title: g.grade ? gradeLabel(g.grade) : t('stats.noGrade'),
            }))}
            now={now}
          />
        </>
      ) : null}

      <Trends entries={entries} now={now} />
    </ScrollView>
  );
}

/** Refuel: "30 L · 15 000 AMD"; service or expense: "Oil change · 25 000 AMD". */
function spendMain(e: Spend): string {
  if (e.kind === 'refuel') return `${formatLiters(e.liters)} · ${formatAmd(e.priceAmd)}`;
  const label = e.kind === 'service' ? serviceLabel(e.category) : expenseLabel(e.category);
  return `${label} · ${formatAmd(entryAmd(e) ?? 0)}`;
}

/** The muted line: station for a refuel, kind and workshop for a service, kind for an expense. */
function spendDetail(e: Spend): string {
  if (e.kind === 'refuel') return stationLine(e);
  const parts = [t(e.kind === 'service' ? 'kinds.service' : 'kinds.expense')];
  if (e.kind === 'service' && e.place) parts.push(e.place);
  return parts.join(' · ');
}

/**
 * The calendar month's spending against the two budgets. Always the current
 * month (see the header); a missing budget still shows what was spent and
 * where the pace is heading.
 */
function MonthCard({ entries, now }: { entries: Entry[]; now: number }) {
  const fuelBudget = useSettings((s) => s.fuelBudget);
  const expenseBudget = useSettings((s) => s.expenseBudget);
  const spent = useMemo(() => {
    const [from, to] = monthBounds(now);
    return spendingIn(entries, from, to);
  }, [entries, now]);
  const fuel = budgetStatus(spent.fuelAmd, fuelBudget);
  const other = budgetStatus(spent.otherAmd, expenseBudget);

  return (
    <>
      <Text style={[styles.label, styles.section]}>{t('stats.month.title')}</Text>
      <View style={styles.calc}>
        <BudgetRow
          label={t('stats.budget.fuel')}
          spent={spent.fuelAmd}
          status={fuel}
          forecast={monthForecast(spent.fuelAmd, now)}
        />
        <View style={styles.hr} />
        <BudgetRow
          label={t('stats.budget.expenses')}
          spent={spent.otherAmd}
          status={other}
          forecast={monthForecast(spent.otherAmd, now)}
        />
        {!fuel && !other ? <Text style={styles.calcNote}>{t('stats.budget.hint')}</Text> : null}
      </View>
    </>
  );
}

function BudgetRow({
  label,
  spent,
  status,
  forecast,
}: {
  label: string;
  spent: number;
  status: ReturnType<typeof budgetStatus>;
  forecast: number | undefined;
}) {
  // A forecast past the budget is a warning before the money is gone.
  const forecastOver =
    status !== undefined && forecast !== undefined && forecast > status.budgetAmd;
  return (
    <View style={styles.budget}>
      <View style={styles.budgetTop}>
        <Text style={styles.budgetLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.budgetFigures}>
          <Text style={[styles.budgetSpent, status?.over && { color: colors.danger }]}>
            {formatAmd(spent)}
          </Text>
          {status ? <Text style={styles.budgetOf}> / {formatAmd(status.budgetAmd)}</Text> : null}
        </Text>
      </View>
      {status ? (
        <View style={styles.bar}>
          <View
            style={[
              styles.barFill,
              {
                width: `${Math.min(1, status.ratio) * 100}%`,
                backgroundColor: status.over ? colors.danger : colors.accent,
              },
            ]}
          />
        </View>
      ) : null}
      <View style={styles.budgetBottom}>
        <Text style={[styles.budgetNote, status?.over && { color: colors.danger }]}>
          {!status
            ? t('stats.budget.noBudget')
            : status.over
              ? t('stats.budget.over', { amd: formatAmd(-status.leftAmd) })
              : t('stats.budget.left', { amd: formatAmd(status.leftAmd) })}
        </Text>
        <Text style={[styles.budgetNote, forecastOver && { color: colors.danger }]}>
          {/* Nothing spent has no pace: "too early" on the 20th would be wrong, so say nothing. */}
          {forecast !== undefined
            ? t('stats.forecast', { amd: formatAmd(forecast) })
            : spent > 0
              ? t('stats.forecast.early')
              : ''}
        </Text>
      </View>
    </View>
  );
}

/** Stations or grades: name and money on top, count, litres, AMD/L and last date under. */
function GroupTable({ rows, now }: { rows: (RefuelGroup & { title: string })[]; now: number }) {
  return (
    <View style={styles.list}>
      {rows.map((r, i) => (
        <View key={`${i}-${r.title}`} style={[styles.dayRow, i > 0 && styles.divider]}>
          <View style={styles.dayTop}>
            <Text style={styles.dayLabel} numberOfLines={1}>
              {r.title}
            </Text>
            <Text style={styles.dayKm}>{formatAmd(r.amd)}</Text>
          </View>
          <Text style={styles.groupDetail} numberOfLines={2}>
            {[
              plural('stats.refuels', r.refuels),
              formatLiters(r.liters),
              r.amdPerL !== undefined ? t('summary.perLiter', { amd: formatAmd(r.amdPerL) }) : '',
              t('stats.last', { day: dayLabel(dayKey(r.lastAt), now) }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Monthly spending bars, then price and km per litre over the last refuels. */
function Trends({ entries, now }: { entries: Entry[]; now: number }) {
  const months = useMemo(() => monthlySpending(entries, now, TREND_MONTHS), [entries, now]);
  const prices = useMemo(
    () =>
      pricePerLiterPoints(entries)
        .slice(-TREND_POINTS)
        .map((p) => p.amdPerL),
    [entries],
  );
  const kmPerL = useMemo(
    () =>
      kmPerLiterPoints(entries)
        .slice(-TREND_POINTS)
        .map((p) => p.kmPerL),
    [entries],
  );
  return (
    <>
      <Text style={[styles.label, styles.section]}>{t('stats.trends')}</Text>
      <MonthBars months={months} />
      <TrendLine
        title={t('stats.chart.price')}
        values={prices}
        format={(n) => t('summary.perLiter', { amd: formatAmd(n) })}
        empty={t('stats.chart.notEnough')}
      />
      <TrendLine
        title={t('stats.chart.kmPerL')}
        values={kmPerL}
        format={(n) => t('stats.chart.kmPerLValue', { n: Math.round(n * 10) / 10 })}
        empty={t('stats.chart.kmPerLNotEnough')}
      />
    </>
  );
}

function Calculator({ entries }: { entries: Entry[] }) {
  const consumption = useSettings((s) => s.consumption);
  const [mode, setMode] = useState<CalcMode>('km');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');

  const lastPrice = useMemo(() => latestPricePerLiter(entries), [entries]);
  const note = useMemo(
    () => consumptionNote(consumptionSource(consumption, entries)),
    [consumption, entries],
  );
  const out = calculate({ mode, amount, price, consumption, entries });

  return (
    <>
      <Text style={[styles.label, styles.section]}>{t('summary.calc.title')}</Text>
      <View style={styles.calc}>
        <Segmented
          options={MODES.map((m) => ({ value: m.value, label: t(m.key) }))}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setAmount('');
          }}
          dark
        />
        <Text style={styles.calcHint}>
          {t(mode === 'km' ? 'summary.calc.hintKm' : 'summary.calc.hintAmd')}
        </Text>
        <CalcInput
          label={t(mode === 'km' ? 'summary.calc.distance' : 'summary.calc.money')}
          suffix={mode === 'km' ? t('summary.unit.km') : 'AMD'}
          value={amount}
          onChange={setAmount}
          placeholder={mode === 'km' ? '100' : '10000'}
          big
        />
        <CalcInput
          label={t('summary.calc.price')}
          suffix={t('summary.unit.amdPerL')}
          value={price}
          onChange={setPrice}
          placeholder={
            lastPrice
              ? t('summary.calc.lastPrice', { price: formatAmd(lastPrice).replace(/ AMD$/, '') })
              : t('summary.unit.amdPerL')
          }
          a11y={t('summary.calc.priceA11y')}
        />
        {note ? <Text style={styles.calcNote}>{note}</Text> : null}
        <View style={styles.hr} />
        {out.ok ? (
          <View style={styles.resultBlock}>
            <Text numberOfLines={1} adjustsFontSizeToFit>
              <Text style={styles.result}>
                ≈ {out.unit === 'AMD' ? formatAmd(out.result).replace(/ AMD$/, '') : out.result}
              </Text>
              <Text style={styles.resultUnit}>
                {' '}
                {out.unit === 'km' ? t('summary.unit.km') : out.unit}
              </Text>
            </Text>
            <Text style={styles.resultDetail}>
              {t('summary.calc.detail', {
                liters: formatLiters(out.liters),
                price: formatAmd(out.price),
              })}
            </Text>
          </View>
        ) : (
          <Text style={styles.muted}>{out.missing}</Text>
        )}
      </View>
    </>
  );
}

function StepBtn({ dir, label, onStep }: { dir: 1 | -1; label: string; onStep: () => void }) {
  const hold = useHoldRepeat(onStep);
  return (
    <Tap {...hold} accessibilityRole="button" accessibilityLabel={label} style={styles.stepBtn}>
      <Text style={styles.stepGlyph}>{dir > 0 ? '+' : '−'}</Text>
    </Tap>
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
    <View style={styles.calcField}>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
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
  stepValTap: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  stepVal: {
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
  calcNote: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    marginHorizontal: spacing.xs,
    marginTop: -spacing.sm,
  },
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
  // Day label and km share the first line; range and AMD go on a second line
  // under the label. Side by side, a day with all three needs ~370dp, more
  // than a 360dp phone's row (~290dp), and the shrinking label broke
  // letter by letter. A fixed second line reads the same on every row,
  // where wrap-when-needed would make rows jump between one and two lines.
  dayRow: {
    justifyContent: 'center',
    gap: 2,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  dayTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  dayLabel: {
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  dayMore: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md, flexWrap: 'wrap' },
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
  groupDetail: { color: colors.muted, fontFamily: fonts.ui, fontSize: 13, fontWeight: '500' },
  budget: { gap: spacing.sm },
  budgetTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  budgetLabel: {
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  budgetFigures: { flexShrink: 1, textAlign: 'right' },
  budgetSpent: {
    color: colors.text,
    fontFamily: fonts.num,
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  budgetOf: { color: colors.muted, fontFamily: fonts.num, fontSize: 13, fontWeight: '500' },
  bar: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: radius.pill },
  budgetBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  budgetNote: { color: colors.muted, fontFamily: fonts.ui, fontSize: 13, fontWeight: '500' },
  addRefuelText: { color: colors.accent, fontFamily: fonts.ui, fontSize: 15, fontWeight: '700' },
});
