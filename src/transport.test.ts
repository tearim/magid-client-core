import { describe, it, expect } from 'vitest';
import {
  buildCommandUrl, getXmlList, javaHashCode, sendCommand, sendStoryReply, type FetchLike, type TransportConfig,
} from './transport.ts';

const BASE = 'http://localhost:8090';

interface Call { url: string; headers?: Record<string, string> }

function fakeFetch(body: string, status = 200): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers });
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
  return { fetch, calls };
}

function config(fetch: FetchLike, extra: Partial<TransportConfig> = {}): TransportConfig {
  return { baseUrl: BASE, clientType: 'browser', fetch, ...extra };
}

describe('buildCommandUrl', () => {
  it('puts cmd, client-type and extra params into the query', () => {
    const url = new URL(buildCommandUrl(config(fakeFetch('').fetch), 'look', { 'freshness-key': 'k1', 'current-scene': 'inn' }));
    expect(url.searchParams.get('cmd')).toBe('look');
    expect(url.searchParams.get('client-type')).toBe('browser');
    expect(url.searchParams.get('freshness-key')).toBe('k1');
    expect(url.searchParams.get('current-scene')).toBe('inn');
  });

  it('announces the configured client type', () => {
    const url = new URL(buildCommandUrl(config(fakeFetch('').fetch, { clientType: 'react' }), ''));
    expect(url.searchParams.get('client-type')).toBe('react');
  });
});

describe('sendCommand', () => {
  it('sends the session id in the Magid-Session header, not in Authorization', async () => {
    const { fetch, calls } = fakeFetch('{}');
    await sendCommand(config(fetch, { sessionId: 'sess-1' }), 'look');
    expect(calls[0].headers).toEqual({ 'Magid-Session': 'sess-1' });
  });

  it('sends no headers without a session', async () => {
    const { fetch, calls } = fakeFetch('{}');
    await sendCommand(config(fetch), 'look');
    expect(calls[0].headers).toBeUndefined();
  });

  it('resolves magid:// anchors in the response body', async () => {
    const { fetch } = fakeFetch('{"menu-background-music":"magid:///bundle/sounds/waves.mp3"}');
    expect(await sendCommand(config(fetch), '')).toBe(`{"menu-background-music":"${BASE}/bundle/sounds/waves.mp3"}`);
  });

  it('throws on HTTP errors', async () => {
    const { fetch } = fakeFetch('oops', 500);
    await expect(sendCommand(config(fetch), 'look')).rejects.toThrow('Server returned 500');
  });

  it('returns protocol error payloads as a normal body', async () => {
    const { fetch } = fakeFetch('{"status":"error","code":"E01001"}');
    expect(await sendCommand(config(fetch), 'look')).toBe('{"status":"error","code":"E01001"}');
  });
});

describe('sendStoryReply', () => {
  it('sends the reply as cmd=story-reply with the reply URL-encoded', async () => {
    const { fetch, calls } = fakeFetch('{}');
    await sendStoryReply(config(fetch, { sessionId: 'sess-1' }), 'help@Show me help', { 'freshness-key': 'k1' });
    expect(calls[0].url).toContain('reply=help%40Show+me+help');
    const params = new URL(calls[0].url).searchParams;
    expect([params.get('cmd'), params.get('reply'), params.get('freshness-key')]).toEqual(['story-reply', 'help@Show me help', 'k1']);
    expect(calls[0].headers).toEqual({ 'Magid-Session': 'sess-1' });
  });

  it('sends a reply named like a server command as a story reply', async () => {
    const { fetch, calls } = fakeFetch('{}');
    await sendStoryReply(config(fetch), 'list-xmls');
    const params = new URL(calls[0].url).searchParams;
    expect([params.get('cmd'), params.get('reply')]).toEqual(['story-reply', 'list-xmls']);
  });

  it('asks for the current menu with an empty cmd and no reply', async () => {
    const { fetch, calls } = fakeFetch('{}');
    await sendStoryReply(config(fetch), '');
    const params = new URL(calls[0].url).searchParams;
    expect([params.get('cmd'), params.get('reply')]).toEqual(['', null]);
  });
});

describe('getXmlList', () => {
  it('accepts a bare array', async () => {
    const { fetch, calls } = fakeFetch('[{"name":"Oasis","path":"oasis.xml"}]');
    expect(await getXmlList(config(fetch))).toEqual([{ name: 'Oasis', path: 'oasis.xml' }]);
    expect(new URL(calls[0].url).searchParams.get('cmd')).toBe('list-xmls');
  });

  it('accepts an object with an xmls array', async () => {
    const { fetch } = fakeFetch('{"xmls":[{"name":"Oasis","path":"oasis.xml"}]}');
    expect(await getXmlList(config(fetch))).toEqual([{ name: 'Oasis', path: 'oasis.xml' }]);
  });
});

describe('javaHashCode', () => {
  it('matches Java String.hashCode()', () => {
    // Expected values computed with Java 25's String.hashCode(); the last one overflows to a negative int.
    expect(javaHashCode('')).toBe(0);
    expect(javaHashCode('hello')).toBe(99162322);
    expect(javaHashCode('606951698-f98aa5ee-5342-4188-957a-efeed5fa429f')).toBe(-290040140);
  });
});
