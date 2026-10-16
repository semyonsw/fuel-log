/**
 * The Gemini client: one REST call per chat turn, and one to list models.
 *
 * Plain `fetch` against `generateContent` rather than the JS SDK: the REST
 * shape is small and stable, and it keeps a Node-oriented SDK out of Hermes.
 * `fetch` is a parameter so tests run against a fake and CI never calls out.
 *
 * Every failure becomes one short, plain sentence for the chat, and the form
 * and the log never depend on this succeeding.
 */

import { parseChatReply, REPLY_SCHEMA, SYSTEM_PROMPT, type ChatReply } from './cluster';

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const TIMEOUT_MS = 45_000;

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** What the model sees for one past or present turn. */
export type Turn = {
  role: 'user' | 'model';
  text: string;
  /** Base64 JPEG, only for photos still in memory this session. */
  imageBase64?: string;
};

export type GeminiError =
  | 'offline'
  | 'timeout'
  | 'cancelled'
  | 'bad-key'
  | 'quota'
  | 'blocked'
  | 'model'
  | 'empty'
  | 'server';

export const ERROR_TEXT: Record<GeminiError, string> = {
  offline: 'No connection. The AI needs internet; everything else works offline.',
  timeout: 'Gemini took too long to answer. Try again.',
  cancelled: 'Cancelled.',
  'bad-key': 'Gemini rejected the API key. Check it in the chat settings.',
  quota: 'Gemini quota used up for now. Try again later or pick another model.',
  blocked: 'Gemini refused to read this. Try another photo.',
  model: 'This model is not available for your key. Pick another one.',
  empty: 'Nothing usable came back. Try a sharper photo.',
  server: 'Gemini had a problem. Try again in a moment.',
};

export type ChatResult = { ok: true; reply: ChatReply } | { ok: false; error: GeminiError };

type Content = {
  role: 'user' | 'model';
  parts: ({ text: string } | { inline_data: { mime_type: string; data: string } })[];
};

/**
 * Turns → contents, with neighbours of the same role merged. A failed reply is
 * not sent back, which can leave two user turns in a row; the API expects the
 * conversation to alternate, so they become one turn with all their parts.
 */
export function mergeTurns(turns: Turn[]): Content[] {
  const out: Content[] = [];
  for (const t of turns) {
    const parts: Content['parts'] = [
      ...(t.text ? [{ text: t.text }] : []),
      ...(t.imageBase64 ? [{ inline_data: { mime_type: 'image/jpeg', data: t.imageBase64 } }] : []),
    ];
    if (parts.length === 0) continue;
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.parts.push(...parts);
    else out.push({ role: t.role, parts });
  }
  return out;
}

export function buildRequest(turns: Turn[], logJson: string) {
  return {
    systemInstruction: {
      parts: [{ text: `${SYSTEM_PROMPT}\n\nThe user's log (JSON, oldest first):\n${logJson}` }],
    },
    contents: mergeTurns(turns),
    generationConfig: { responseMimeType: 'application/json', responseSchema: REPLY_SCHEMA },
  };
}

function classifyHttp(status: number, body: string): GeminiError {
  if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(body)) return 'bad-key';
  if (status === 401 || status === 403) return 'bad-key';
  if (status === 429) return 'quota';
  if (status === 404) return 'model';
  return 'server';
}

/** Combines the caller's cancel with a timeout; reports which one fired. */
function withTimeout(signal: AbortSignal | undefined, ms: number) {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, ms);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  return {
    signal: ctrl.signal,
    timedOut: () => timedOut,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

export async function sendChat(opts: {
  apiKey: string;
  model: string;
  turns: Turn[];
  logJson: string;
  fetch: Fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<ChatResult> {
  const t = withTimeout(opts.signal, opts.timeoutMs ?? TIMEOUT_MS);
  try {
    const res = await opts.fetch(`${GEMINI_BASE}/models/${opts.model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
      body: JSON.stringify(buildRequest(opts.turns, opts.logJson)),
      signal: t.signal,
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, error: classifyHttp(res.status, body) };
    return interpret(body);
  } catch {
    if (opts.signal?.aborted) return { ok: false, error: 'cancelled' };
    if (t.timedOut()) return { ok: false, error: 'timeout' };
    return { ok: false, error: 'offline' };
  } finally {
    t.done();
  }
}

/** A 200 body → reply, or why there isn't one. */
export function interpret(body: string): ChatResult {
  let data: {
    promptFeedback?: { blockReason?: string };
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  };
  try {
    data = JSON.parse(body);
  } catch {
    return { ok: false, error: 'server' };
  }
  if (data.promptFeedback?.blockReason) return { ok: false, error: 'blocked' };
  const cand = data.candidates?.[0];
  if (!cand) return { ok: false, error: 'empty' };
  const text = (cand.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!text && /SAFETY|PROHIBITED|BLOCKLIST|IMAGE_SAFETY/.test(cand.finishReason ?? '')) {
    return { ok: false, error: 'blocked' };
  }
  const reply = parseChatReply(text);
  return reply ? { ok: true, reply } : { ok: false, error: 'empty' };
}

/** GET /models — for hiding offered models this key cannot use. Undefined on any failure. */
export async function listModels(apiKey: string, fetchFn: Fetch) {
  try {
    const res = await fetchFn(`${GEMINI_BASE}/models?pageSize=1000`, {
      headers: { 'x-goog-api-key': apiKey },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    return data.models;
  } catch {
    return undefined;
  }
}
