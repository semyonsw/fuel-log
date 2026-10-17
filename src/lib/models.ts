/**
 * The Gemini models the chat offers.
 *
 * Only current, stable, image-capable text models from Google's model list
 * (checked 2026-10-16). Previews, shut-down and "existing users only" models
 * (2.0, 2.5, 3-pro-preview…) are left out on purpose. When the user's key can
 * list models, the picker also hides any of these the key cannot reach, so a
 * retired model disappears without an app update.
 */

import { t, type StringKey } from '../i18n';

export type GeminiModel = { id: string; label: string; note: string };

/** Product names stay as Google writes them; the note is a getter so it follows the language. */
const model = (id: string, label: string, noteKey: StringKey): GeminiModel => ({
  id,
  label,
  get note() {
    return t(noteKey);
  },
});

export const GEMINI_MODELS: GeminiModel[] = [
  model('gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite', 'form.model.fastest'),
  model('gemini-3.8-flash', 'Gemini 3.8 Flash', 'form.model.capable'),
  model('gemini-3.6-flash', 'Gemini 3.6 Flash', 'form.model.previous'),
  model('gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite', 'form.model.olderLite'),
  model('gemini-4-argon', 'Gemini 4 Argon', 'form.model.flagship'),
];

export const DEFAULT_MODEL = GEMINI_MODELS[0].id;

export function modelLabel(id: string): string {
  return GEMINI_MODELS.find((m) => m.id === id)?.label ?? id;
}

/**
 * The offered models the API says this key can use for generateContent.
 * `listed` is the `models` array from GET /v1beta/models; names come as
 * "models/<id>". An empty or failed listing keeps the full list.
 */
export function availableModels(
  listed: { name?: string; supportedGenerationMethods?: string[] }[] | undefined,
): GeminiModel[] {
  if (!listed || listed.length === 0) return GEMINI_MODELS;
  const ok = new Set(
    listed
      .filter(
        (m) =>
          !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'),
      )
      .map((m) => (m.name ?? '').replace(/^models\//, '')),
  );
  const out = GEMINI_MODELS.filter((m) => ok.has(m.id));
  return out.length ? out : GEMINI_MODELS;
}

/** A stored choice that is no longer offered falls back to the default. */
export function resolveModel(id: string | undefined): string {
  return GEMINI_MODELS.some((m) => m.id === id) ? (id as string) : DEFAULT_MODEL;
}
