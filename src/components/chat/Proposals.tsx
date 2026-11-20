/**
 * The changes an answer proposes, each as an editable card, and one Approve
 * for all of them. Nothing here touches the log: the card only edits the
 * proposal, and the screen's Approve is the one way a change gets saved.
 *
 * A delete card is read-only: what it shows is what goes. An edit card marks
 * every field it changes with "old → new". After saving, the cards stay as a
 * read-only record; cards a later answer replaced stay read-only too, with no
 * Approve, so the same entries cannot be saved twice.
 *
 * A card can be removed while there are others, or whenever Approve said what
 * is wrong with it: a lone card whose entry has gone from the log would
 * otherwise sit there unsaveable for good.
 */

import { StyleSheet, Text, View } from 'react-native';

import { plural, t, type StringKey } from '../../i18n';
import {
  changedFields,
  MAX_LITERS,
  MAX_PRICE_AMD,
  MAX_RANGE_KM,
  MAX_TRIP_KM,
  type Proposal,
  type ProposalValues,
} from '../../lib/assistant';
import { formKinds } from '../../lib/draft';
import { formatAmd } from '../../lib/numbers';
import { colors, fonts, radius, spacing } from '../../theme';
import type { EntryKind } from '../../types';
import { Button, Chip, Tap } from '../ui';
import { ClockRow, DateRow, NumberRow, TextRow, Was } from './fields';

/** Functions, not tables, so the words are read at render time. */
const KIND_KEYS: Record<EntryKind, StringKey> = {
  reading: 'chat.kind.reading',
  trip: 'chat.kind.trip',
  refuel: 'chat.kind.refuel',
};
export const kindTitle = (kind: EntryKind): string => t(KIND_KEYS[kind]);

const KIND_CHIPS: { value: EntryKind; key: StringKey }[] = [
  { value: 'trip', key: 'chat.seg.trip' },
  { value: 'reading', key: 'chat.seg.reading' },
  { value: 'refuel', key: 'chat.seg.refuel' },
];

/** What the card's button and footer say, from the mix of changes it holds. */
function cardWords(proposals: Proposal[]) {
  const n = proposals.length;
  if (proposals.every((p) => p.op === 'delete')) {
    return {
      approve: n > 1 ? plural('chat.deleteEntryN', n) : t('chat.deleteEntry'),
      saved: t('chat.deleted'),
      foot: t('chat.deleteFoot'),
      danger: true,
    };
  }
  if (proposals.some((p) => p.op !== 'add')) {
    return {
      approve: n > 1 ? plural('chat.applyN', n) : t('chat.apply'),
      saved: n > 1 ? plural('chat.savedChanges', n) : t('chat.updated'),
      foot: t('chat.updateFoot'),
      danger: false,
    };
  }
  return {
    approve: n > 1 ? plural('chat.approveN', n) : t('chat.approve'),
    saved: n > 1 ? plural('chat.savedN', n) : t('chat.saved'),
    foot: t('chat.approveFoot'),
    danger: false,
  };
}

/** The kinds a card may switch to: any for a new entry, as far as the form could for an edit. */
function switchableKinds(p: Proposal) {
  if (p.op === 'add') return KIND_CHIPS;
  if (p.op === 'update') {
    return KIND_CHIPS.filter((k) => formKinds(p.before?.kind ?? p.kind).includes(k.value));
  }
  return [];
}

function cardTitle(p: Proposal): string {
  if (p.op === 'add') return kindTitle(p.kind);
  const op = t(p.op === 'update' ? 'chat.op.update' : 'chat.op.delete');
  return `${op} · ${kindTitle(p.kind)}`;
}

type ProposalsProps = {
  proposals: Proposal[];
  saved: boolean;
  /** A later answer re-sent these cards corrected; only that one can be approved. */
  replaced: boolean;
  lowConfidence: boolean;
  problems?: (string | undefined)[];
  onChange: (p: Proposal[]) => void;
  onApprove: () => void;
};

export function Proposals({
  proposals,
  saved,
  replaced,
  lowConfidence,
  problems,
  onChange,
  onApprove,
}: ProposalsProps) {
  const closed = saved || replaced;
  const edit = (i: number, patch: Partial<Proposal>) =>
    onChange(proposals.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const remove = (i: number) => onChange(proposals.filter((_, j) => j !== i));
  const words = cardWords(proposals);
  const hasDelete = proposals.some((p) => p.op === 'delete');

  return (
    <View style={[styles.card, hasDelete && styles.cardDanger, closed && styles.cardSaved]}>
      {lowConfidence && !closed ? (
        <Text style={styles.cardWarn}>{t('chat.lowConfidence')}</Text>
      ) : null}
      {proposals.map((p, i) => {
        const kinds = switchableKinds(p);
        const title = cardTitle(p);
        return (
          // Cards are only removed or edited in place, never reordered.
          <View key={i} style={[styles.prop, i > 0 && styles.propDivider]}>
            <View style={styles.cardHead}>
              <Text style={[styles.cardTitle, p.op === 'delete' && { color: colors.danger }]}>
                {proposals.length > 1 ? `${i + 1}. ` : ''}
                {title}
              </Text>
              {!closed && (proposals.length > 1 || problems?.[i]) ? (
                <Tap
                  onPress={() => remove(i)}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.removeKindA11y', { kind: title })}
                  hitSlop={10}
                >
                  <Text style={styles.removeText}>{t('chat.remove')}</Text>
                </Tap>
              ) : null}
            </View>
            {!closed && kinds.length > 1 ? (
              <View style={styles.chips}>
                {kinds.map((k) => (
                  <Chip
                    key={k.value}
                    label={t(k.key)}
                    active={p.kind === k.value}
                    onPress={() => p.kind !== k.value && edit(i, { kind: k.value })}
                  />
                ))}
              </View>
            ) : null}
            <ProposalFields
              p={p}
              locked={closed || p.op === 'delete'}
              onEdit={(patch) => edit(i, patch)}
            />
            {problems?.[i] ? <Text style={styles.problem}>{problems[i]}</Text> : null}
          </View>
        );
      })}
      {saved ? <Text style={styles.savedText}>{words.saved}</Text> : null}
      {replaced && !saved ? <Text style={styles.cardFoot}>{t('chat.replaced')}</Text> : null}
      {closed ? null : (
        <>
          <Button
            label={words.approve}
            variant={words.danger ? 'danger' : 'primary'}
            onPress={onApprove}
          />
          <Text style={styles.cardFoot}>{words.foot}</Text>
        </>
      )}
    </View>
  );
}

const blank = (v: unknown) => v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** One card value as text, for the old → new line. */
function shown(k: keyof ProposalValues, v: ProposalValues[keyof ProposalValues]): string {
  if (blank(v)) return '—';
  if (k === 'stops' && Array.isArray(v)) return v.join(' → ');
  if (k === 'kind') return kindTitle(v as EntryKind);
  return String(v);
}

type FieldsProps = {
  p: Proposal;
  locked: boolean;
  onEdit: (patch: Partial<Proposal>) => void;
};

function ProposalFields({ p, locked, onEdit }: FieldsProps) {
  const changed = new Set(changedFields(p));
  /** "20 → 30" under a field an edit card changes; nothing otherwise. */
  const was = (k: keyof ProposalValues) =>
    p.before && changed.has(k)
      ? t('chat.change', { old: shown(k, p.before[k]), new: shown(k, p[k]) })
      : undefined;
  const range = (label: string) => (
    <NumberRow
      label={label}
      unit={t('chat.unit.km')}
      value={p.rangeKm}
      max={MAX_RANGE_KM}
      locked={locked}
      was={was('rangeKm')}
      onChange={(rangeKm) => onEdit({ rangeKm })}
    />
  );

  return (
    <>
      <Was text={was('kind')} />
      {p.kind === 'trip' ? <TripFields p={p} locked={locked} onEdit={onEdit} was={was} /> : null}
      {p.kind === 'refuel' ? (
        <RefuelFields p={p} locked={locked} onEdit={onEdit} was={was} />
      ) : null}
      {range(t(p.kind === 'refuel' ? 'chat.field.rangeAfter' : 'chat.field.rangeLeft'))}
      <DateRow
        value={p.date}
        locked={locked}
        was={was('date')}
        onChange={(date) => onEdit({ date })}
      />
      <ClockRow
        value={p.clock}
        locked={locked}
        was={was('clock')}
        onChange={(clock) => onEdit({ clock })}
      />
      <TextRow
        label={t('chat.field.note')}
        value={p.note}
        locked={locked}
        was={was('note')}
        onChange={(note) => onEdit({ note })}
      />
    </>
  );
}

type KindFieldsProps = FieldsProps & { was: (k: keyof ProposalValues) => string | undefined };

function TripFields({ p, locked, onEdit, was }: KindFieldsProps) {
  return (
    <>
      <TextRow
        label={t('chat.field.from')}
        value={p.from}
        locked={locked}
        was={was('from')}
        onChange={(from) => onEdit({ from })}
      />
      {p.stops.length ? (
        <Text style={styles.cardNote}>{t('chat.field.via', { stops: p.stops.join(' → ') })}</Text>
      ) : null}
      <Was text={was('stops')} />
      <TextRow
        label={t('chat.field.to')}
        value={p.to}
        locked={locked}
        was={was('to')}
        onChange={(to) => onEdit({ to })}
      />
      <NumberRow
        label={t('chat.field.distance')}
        unit={t('chat.unit.km')}
        value={p.distanceKm}
        max={MAX_TRIP_KM}
        locked={locked}
        was={was('distanceKm')}
        onChange={(distanceKm) => onEdit({ distanceKm })}
      />
    </>
  );
}

function RefuelFields({ p, locked, onEdit, was }: KindFieldsProps) {
  return (
    <>
      <NumberRow
        label={t('chat.field.liters')}
        unit={t('chat.unit.l')}
        value={p.liters}
        max={MAX_LITERS}
        locked={locked}
        was={was('liters')}
        onChange={(liters) => onEdit({ liters })}
      />
      <NumberRow
        label={t('chat.field.totalPaid')}
        unit="AMD"
        value={p.priceAmd}
        max={MAX_PRICE_AMD}
        steps={[1000, 100]}
        whole
        locked={locked}
        was={was('priceAmd')}
        onChange={(priceAmd) => onEdit({ priceAmd })}
      />
      {p.liters && p.priceAmd ? (
        <Text style={styles.cardNote}>
          {t('chat.field.perLiter', { price: formatAmd(p.priceAmd / p.liters) })}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: {
    color: colors.accent,
    fontFamily: fonts.ui,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  cardWarn: { color: colors.danger, fontFamily: fonts.ui, fontSize: 13, fontWeight: '600' },
  cardNote: { color: colors.muted, fontFamily: fonts.ui, fontSize: 13, fontStyle: 'italic' },
  cardSaved: { borderColor: colors.border },
  cardDanger: { borderColor: colors.danger },
  prop: { gap: spacing.md },
  propDivider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  removeText: { color: colors.danger, fontFamily: fonts.ui, fontSize: 13, fontWeight: '700' },
  problem: { color: colors.danger, fontFamily: fonts.ui, fontSize: 13, fontWeight: '600' },
  savedText: { color: colors.success, fontFamily: fonts.ui, fontSize: 14, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cardFoot: { color: colors.muted, fontFamily: fonts.ui, fontSize: 12, lineHeight: 17 },
});
