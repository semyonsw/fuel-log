/**
 * One message in the thread: the user's text (and photo, while it is still in
 * memory) or the model's answer, with the cards it proposes underneath.
 */

import { Image, StyleSheet, Text, View } from 'react-native';

import { t } from '../../i18n';
import type { Proposal } from '../../lib/assistant';
import type { ChatMessage } from '../../lib/chat';
import { formatTime } from '../../lib/entries';
import type { Photo } from '../../services/photo';
import { colors, fonts, radius, spacing } from '../../theme';
import { Proposals } from './Proposals';

type Props = {
  msg: ChatMessage;
  photo?: Photo;
  problems?: (string | undefined)[];
  /** Its cards were re-sent corrected in a later answer (lib/chat `supersededIds`). */
  replaced: boolean;
  onEdit: (p: Proposal[]) => void;
  onApprove: () => void;
};

export function Bubble({ msg, photo, problems, replaced, onEdit, onApprove }: Props) {
  const mine = msg.role === 'user';
  const photoView = photo ? (
    <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="cover" />
  ) : (
    <Text style={styles.photoGone}>{t('chat.photoGone')}</Text>
  );
  return (
    <View style={[styles.msg, mine ? styles.msgMine : styles.msgTheirs]}>
      <View
        style={[
          styles.bubble,
          mine ? styles.bubbleMine : styles.bubbleTheirs,
          msg.error && styles.bubbleError,
        ]}
      >
        {msg.hasPhoto ? photoView : null}
        {msg.text ? (
          <Text style={[styles.msgText, msg.error && { color: colors.danger }]}>{msg.text}</Text>
        ) : null}
        <Text style={styles.msgTime}>{formatTime(msg.at)}</Text>
      </View>
      {msg.proposals?.length ? (
        <Proposals
          proposals={msg.proposals}
          saved={!!msg.savedIds}
          replaced={replaced}
          lowConfidence={msg.confidence === 'low'}
          problems={problems}
          onChange={onEdit}
          onApprove={onApprove}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  msg: { gap: spacing.sm },
  msgMine: { alignItems: 'flex-end' },
  msgTheirs: { alignItems: 'flex-start' },
  bubble: { maxWidth: '86%', borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  bubbleMine: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(245,165,36,0.35)',
    borderBottomRightRadius: radius.sm,
  },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.sm,
  },
  bubbleError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  msgText: { color: colors.text, fontFamily: fonts.ui, fontSize: 16, lineHeight: 22 },
  msgTime: { color: colors.muted, fontFamily: fonts.num, fontSize: 11, alignSelf: 'flex-end' },
  photo: { width: 220, height: 150, borderRadius: radius.md },
  photoGone: { color: colors.muted, fontFamily: fonts.ui, fontSize: 14, fontStyle: 'italic' },
});
