/**
 * "Your data": export, import, and the auto-backup folder and its status.
 * Self-contained (reads and writes settings itself) so it can sit on any
 * screen; it lives on Settings.
 *
 * Export with no folder chosen asks for one first, which also turns on
 * auto-backup. Import asks Merge or Replace, because Replace can drop entries
 * that only exist on this phone.
 */

import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { plural, t } from '../i18n';
import { folderLabel } from '../lib/backup';
import { dayKey, dayLabel, formatTime } from '../lib/entries';
import { applyBackup, backupNow, chooseBackupFolder, pickBackupFile } from '../services/backup';
import { useSettings } from '../state/settings';
import { colors, fonts, radius, spacing, TOUCH } from '../theme';
import { Button, Tap } from './ui';

export function DataSection() {
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
        t('summary.data.saved'),
        t('summary.data.savedIn', {
          file: status.file,
          folder: folderLabel(useSettings.getState().backupDirUri ?? ''),
        }),
      );
    else if (dir || useSettings.getState().backupDirUri)
      Alert.alert(
        t('summary.data.notSaved'),
        status && !status.ok ? status.error : t('summary.data.tryAgain'),
      );
  };

  const importNow = async () => {
    const picked = await pickBackupFile();
    if (!picked.ok) {
      if (picked.error) Alert.alert(t('summary.data.importFailed'), picked.error);
      return;
    }
    const b = picked.backup;
    const when = b.exportedAt ? new Date(b.exportedAt) : undefined;
    const head =
      when && !Number.isNaN(when.getTime())
        ? t('summary.data.backupFrom', {
            when: `${dayLabel(dayKey(when.getTime()), Date.now())} ${formatTime(when.getTime())}`,
          })
        : t('summary.data.backup');
    const run = async (mode: 'merge' | 'replace') => {
      const r = await applyBackup(b, mode);
      const done =
        mode === 'merge'
          ? t('summary.data.merged', { added: r.added, updated: r.updated })
          : t('summary.data.replaced');
      Alert.alert(
        t('summary.data.imported'),
        `${done} ${plural('summary.data.entriesNow', r.total)}`,
      );
    };
    Alert.alert(
      t('summary.data.confirmTitle'),
      t('summary.data.confirmBody', {
        head,
        entries: plural('summary.data.entries', b.entries.length),
        chats: plural('summary.data.chats', b.chats.length),
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('summary.data.replace'),
          style: 'destructive',
          onPress: () => void run('replace'),
        },
        { text: t('summary.data.merge'), onPress: () => void run('merge') },
      ],
    );
  };

  return (
    <>
      <Text style={[styles.label, styles.section]}>{t('summary.data.title')}</Text>
      <View style={styles.card}>
        <Text style={styles.dataText}>
          {dir ? t('summary.data.autoOn', { folder: folderLabel(dir) }) : t('summary.data.autoOff')}
        </Text>
        {last ? (
          <Text style={[styles.muted, !last.ok && { color: colors.danger }]}>
            {last.ok
              ? t('summary.data.lastSaved', {
                  when: `${dayLabel(dayKey(last.at), Date.now())} ${formatTime(last.at)}`,
                  file: last.file,
                })
              : last.error}
          </Text>
        ) : null}
        <View style={styles.pair}>
          <View style={styles.flex}>
            <Button
              label={busy ? t('summary.data.saving') : t('summary.data.export')}
              onPress={exportNow}
            />
          </View>
          <View style={styles.flex}>
            <Button label={t('summary.data.import')} variant="ghost" onPress={importNow} />
          </View>
        </View>
        <Tap
          onPress={() => void chooseBackupFolder()}
          accessibilityRole="button"
          style={styles.folderBtn}
        >
          <Text style={styles.folderText}>
            {dir ? t('summary.data.changeFolder') : t('summary.data.chooseFolder')}
          </Text>
        </Tap>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  pair: { flexDirection: 'row', gap: spacing.md },
  muted: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
  },
  dataText: { color: colors.text, fontFamily: fonts.ui, fontSize: 15, lineHeight: 21 },
  folderBtn: { minHeight: TOUCH, justifyContent: 'center' },
  folderText: { color: colors.accent, fontFamily: fonts.ui, fontSize: 15, fontWeight: '700' },
});
