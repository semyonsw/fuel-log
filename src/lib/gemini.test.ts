import { describe, expect, it, vi } from 'vitest';

import { buildRequest, interpret, listModels, mergeTurns, sendChat, type Fetch } from './gemini';

/** Every test runs against a fake fetch: no request ever leaves the machine. */

const okBody = (text: string) =>
  JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] });

const respond = (status: number, body: string): Fetch =>
  vi.fn(async () => new Response(body, { status }));

const base = { apiKey: 'k', model: 'gemini-3.5-flash-lite', logJson: '[]', turns: [] };

describe('buildRequest', () => {
  it('puts the log in the system instruction and the photo as inline JPEG', () => {
    const req = buildRequest(
      [
        { role: 'user', text: 'read this', imageBase64: 'AAAA' },
        { role: 'model', text: '{"reply":"ok","reading":null}' },
      ],
      '[{"kind":"reading"}]',
    );
    expect(req.systemInstruction.parts[0].text).toContain('[{"kind":"reading"}]');
    expect(req.systemInstruction.parts[0].text).toContain('Nissan Sentra 2023 SV');
    expect(req.contents[0].parts).toEqual([
      { text: 'read this' },
      { inline_data: { mime_type: 'image/jpeg', data: 'AAAA' } },
    ]);
    expect(req.contents[1].role).toBe('model');
    expect(req.generationConfig.responseMimeType).toBe('application/json');
  });
});

describe('sendChat', () => {
  it('posts to the model and returns the parsed reply', async () => {
    const f = respond(
      200,
      okBody(
        '{"reply":"Range 54 km","reading":{"rangeKm":54,"tripKm":null,"clock":null,"confidence":"high"}}',
      ),
    );
    const r = await sendChat({ ...base, fetch: f });
    expect(r).toMatchObject({
      ok: true,
      reply: { reply: 'Range 54 km', reading: { rangeKm: 54 } },
    });
    const [url, init] = (f as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/models/gemini-3.5-flash-lite:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('k');
  });

  it.each([
    [
      400,
      '{"error":{"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}',
      'bad-key',
    ],
    [403, '{}', 'bad-key'],
    [429, '{}', 'quota'],
    [404, '{}', 'model'],
    [500, '{}', 'server'],
  ])('HTTP %i → %s', async (status, body, error) => {
    expect(await sendChat({ ...base, fetch: respond(status, body) })).toEqual({ ok: false, error });
  });

  it('no connection → offline', async () => {
    const f: Fetch = async () => {
      throw new TypeError('Network request failed');
    };
    expect(await sendChat({ ...base, fetch: f })).toEqual({ ok: false, error: 'offline' });
  });

  it('times out', async () => {
    const f: Fetch = (_u, init) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    expect(await sendChat({ ...base, fetch: f, timeoutMs: 10 })).toEqual({
      ok: false,
      error: 'timeout',
    });
  });

  it('can be cancelled', async () => {
    const ctrl = new AbortController();
    const f: Fetch = (_u, init) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    const p = sendChat({ ...base, fetch: f, signal: ctrl.signal });
    ctrl.abort();
    expect(await p).toEqual({ ok: false, error: 'cancelled' });
  });
});

describe('interpret', () => {
  it('blocked prompt', () => {
    expect(interpret('{"promptFeedback":{"blockReason":"SAFETY"}}')).toEqual({
      ok: false,
      error: 'blocked',
    });
  });
  it('blocked answer', () => {
    expect(interpret('{"candidates":[{"finishReason":"SAFETY"}]}')).toEqual({
      ok: false,
      error: 'blocked',
    });
  });
  it('empty and malformed', () => {
    expect(interpret('{"candidates":[]}')).toEqual({ ok: false, error: 'empty' });
    expect(interpret(okBody('not json'))).toEqual({ ok: false, error: 'empty' });
    expect(interpret('<html>')).toEqual({ ok: false, error: 'server' });
  });
});

describe('listModels', () => {
  it('returns the models array, or undefined on failure', async () => {
    const f = respond(200, '{"models":[{"name":"models/gemini-3.8-flash"}]}');
    expect(await listModels('k', f)).toEqual([{ name: 'models/gemini-3.8-flash' }]);
    expect(await listModels('k', respond(403, '{}'))).toBeUndefined();
  });
});

describe('mergeTurns', () => {
  it('merges neighbours of the same role and drops empty turns', () => {
    expect(
      mergeTurns([
        { role: 'user', text: 'first' },
        { role: 'user', text: '', imageBase64: 'BB' },
        { role: 'user', text: '' },
        { role: 'model', text: 'ok' },
        { role: 'user', text: 'again' },
      ]),
    ).toEqual([
      {
        role: 'user',
        parts: [{ text: 'first' }, { inline_data: { mime_type: 'image/jpeg', data: 'BB' } }],
      },
      { role: 'model', parts: [{ text: 'ok' }] },
      { role: 'user', parts: [{ text: 'again' }] },
    ]);
  });
});
