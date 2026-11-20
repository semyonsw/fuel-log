/** The saved chats, newest activity first, with "+" to start one and a bin per row. */

import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { plural, t } from '../../i18n';
import { sortChats, type Chat } from '../../lib/chat';
import { dayKey, dayLabel, formatTime } from '../../lib/entries';
import { colors, fonts, radius, spacing, TOUCH } from '../../theme';
import { PlusIcon, TrashIcon } from '../icons';
import { Tap } from '../ui';

type Props = {
  chats: Chat[];
  current: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
};

export function History({ chats, current, onOpen, onNew, onDelete }: Props) {
  const sorted = useMemo(() => sortChats(chats), [chats]);
  return (
    <FlatList
      style={styles.flex}
      data={sorted}
      keyExtractor={(c) => c.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <Tap onPress={onNew} accessibilityRole="button" style={styles.newChat}>
          <PlusIcon size={18} color={colors.accent} />
          <Text style={styles.newChatText}>{t('chat.new')}</Text>
        </Tap>
      }
      ListEmptyComponent={<Text style={styles.empty}>{t('chat.noChats')}</Text>}
      renderItem={({ item }) => (
        <Tap
          onPress={() => onOpen(item.id)}
          accessibilityRole="button"
          style={[styles.row, item.id === current && styles.rowOn]}
        >
          <View style={styles.flex}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.meta}>
              {dayLabel(dayKey(item.updatedAt), Date.now())} {formatTime(item.updatedAt)} ·{' '}
              {plural('chat.messages', item.messages.length)}
            </Text>
          </View>
          <Tap
            onPress={() => onDelete(item.id)}
            accessibilityRole="button"
            accessibilityLabel={t('chat.deleteChatA11y', { title: item.title })}
            style={styles.iconBtn}
          >
            <TrashIcon size={20} color={colors.muted} />
          </Tap>
        </Tap>
      )}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.sm },
  iconBtn: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  empty: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  newChat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: TOUCH,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  newChatText: { color: colors.accent, fontFamily: fonts.ui, fontSize: 15, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 64,
    paddingLeft: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowOn: { borderColor: colors.accent },
  title: { color: colors.text, fontFamily: fonts.ui, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.muted, fontFamily: fonts.ui, fontSize: 13, marginTop: 2 },
});
