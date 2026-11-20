/**
 * "AI chat": the Gemini API key and the model, on Settings. 1.7.0 kept these
 * in a sheet behind the chat's model button; they live here too so they can
 * be set before the first chat and found without opening one.
 *
 * The key field starts empty even when a key is saved: the key is never shown
 * back, only replaced or removed. The model list hides the offered models the
 * saved key cannot reach (`availableModels`), so a retired model drops out
 * without an app update; with no key, or offline, the full list shows.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { t } from '../i18n';
import { listModels } from '../lib/gemini';
import { availableModels, GEMINI_MODELS, resolveModel, type GeminiModel } from '../lib/models';
import { saveApiKey } from '../services/secrets';
import { useSettings } from '../state/settings';
import { colors, fonts, radius, spacing } from '../theme';
import { Button, SectionLabel, Tap } from './ui';

export function AiSection() {
  return (
    <View style={styles.group}>
      <SectionLabel>{t('app.settings.ai')}</SectionLabel>
      <KeyField />
      <ModelList />
    </View>
  );
}

function KeyField() {
  const apiKey = useSettings((s) => s.apiKey);
  const [draft, setDraft] = useState('');

  const save = () => {
    if (!draft.trim()) return;
    void saveApiKey(draft);
    setDraft('');
  };

  return (
    <>
      <View style={styles.box}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={save}
          placeholder={apiKey ? t('app.settings.keySaved') : 'AIza…'}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          accessibilityLabel={t('app.settings.keyA11y')}
          style={styles.input}
        />
      </View>
      <Text style={styles.hint}>{t('app.settings.keyHint')}</Text>
      <Text style={styles.hint}>{t('app.settings.keyPrivacy')}</Text>
      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button label={t('app.settings.saveKey')} dim={!draft.trim()} onPress={save} />
        </View>
        {apiKey ? (
          <View style={styles.flex}>
            <Button
              label={t('app.settings.removeKey')}
              variant="ghost"
              onPress={() => void saveApiKey('')}
            />
          </View>
        ) : null}
      </View>
    </>
  );
}

function ModelList() {
  const apiKey = useSettings((s) => s.apiKey);
  const current = resolveModel(useSettings((s) => s.geminiModel));
  const set = useSettings((s) => s.set);
  const [models, setModels] = useState<GeminiModel[]>(GEMINI_MODELS);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!apiKey) {
      setModels(GEMINI_MODELS);
      return;
    }
    let live = true;
    setChecking(true);
    void listModels(apiKey, (u, i) => fetch(u, i)).then((listed) => {
      if (!live) return;
      setModels(availableModels(listed));
      setChecking(false);
    });
    return () => {
      live = false;
    };
  }, [apiKey]);

  return (
    <>
      <Text style={[styles.hint, styles.modelIntro]}>
        {checking ? t('app.settings.modelChecking') : t('app.settings.modelIntro')}
      </Text>
      {models.map((m) => {
        const on = m.id === current;
        return (
          <Tap
            key={m.id}
            onPress={() => set({ geminiModel: m.id })}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[styles.modelOpt, on && styles.modelOptOn]}
          >
            <View style={[styles.radio, on && styles.radioOn]}>
              {on ? <View style={styles.radioDot} /> : null}
            </View>
            <View style={styles.flex}>
              <Text style={[styles.modelTitle, on && { color: colors.accent }]}>{m.label}</Text>
              <Text style={styles.modelNote}>
                {m.note} · {m.id}
              </Text>
            </View>
          </Tap>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: spacing.sm, marginTop: spacing.sm },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontFamily: fonts.num,
    fontSize: 16,
    fontWeight: '500',
    paddingVertical: spacing.md,
  },
  hint: {
    color: colors.muted,
    fontFamily: fonts.ui,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    marginHorizontal: spacing.xs,
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  modelIntro: { marginTop: spacing.sm },
  modelOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modelOptOn: { borderColor: colors.accent, backgroundColor: colors.surface2 },
  modelTitle: { color: colors.text, fontFamily: fonts.ui, fontSize: 16, fontWeight: '600' },
  modelNote: { color: colors.muted, fontFamily: fonts.ui, fontSize: 12, marginTop: 2 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
});
