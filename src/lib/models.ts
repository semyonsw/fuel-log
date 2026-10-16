/**
 * The Gemini models the chat offers.
 *
 * Only current, stable, image-capable text models from Google's model list
 * (checked 2026-10-16). Previews, shut-down and "existing users only" models
 * (2.0, 2.5, 3-pro-preview…) are left out on purpose. When the user's key can
 * list models, the picker also hides any of these the key cannot reach, so a
 * retired model disappears without an app update.
 */

export type GeminiModel = { id: string; label: string; note: string };

export const GEMINI_MODELS: GeminiModel[] = [
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', note: 'Fastest, lowest cost' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', note: 'Most capable Flash' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', note: 'Previous Flash' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', note: 'Older Flash-Lite' },
  { id: 'gemini-4-argon', label: 'Gemini 4 Argon', note: 'Flagship reasoning, slower' },
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
