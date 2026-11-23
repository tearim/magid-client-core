import { describe, it, expect, vi } from 'vitest';
import {
  parseStreamMessage, splitStreamPlaceholders, streamClassName, StreamConnection, streamIdsOf, streamPlaceholder, StreamTracker,
  type EventSourceLike, type StreamMessage,
} from './streams.ts';
import { MagidClient } from './client.ts';
import type { FetchLike } from './transport.ts';

const BASE = 'http://localhost:8090';
const ID = 'str-1';

const delta = (no: number, text: string, id = ID): StreamMessage => ({ 'stream-id': id, no, delta: text });
const snapshot = (no: number, text: string, id = ID): StreamMessage => ({ 'stream-id': id, no, snapshot: text });
const warmUp = (text: string, id = ID): StreamMessage => ({ 'stream-id': id, no: 0, snapshot: text, 'warm-up': true });
const done = (value: string, status = 'ok', id = ID): StreamMessage => ({ 'stream-id': id, done: true, status, value });

// An EventSource that records its URL; the test sends messages through `emit`.
function fakeEventSource() {
  const opened: { url: string; source: EventSourceLike & { closed: boolean } }[] = [];
  const factory = (url: string) => {
    const source = { onmessage: null, onerror: null, closed: false, close() { this.closed = true; } } as
      EventSourceLike & { closed: boolean };
    opened.push({ url, source });
    return source;
  };
  const emit = (data: unknown) => opened.at(-1)!.source.onmessage!({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  return { factory, opened, emit };
}

// A fake server for fetch: scripted bodies in order, the requests' parameters recorded.
function fakeServer(...bodies: object[]) {
  const requests: Record<string, string>[] = [];
  const fetch: FetchLike = async (url) => {
    const params: Record<string, string> = {};
    for (const [k, v] of (new URL(url).searchParams as unknown as Iterable<[string, string]>)) params[k] = v;
    requests.push(params);
    const body = bodies.shift() ?? { 'stream-events': [] };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  return { fetch, requests };
}

describe('StreamTracker: the client rules', () => {
  it('appends the first delta', () => {
    const t = new StreamTracker();
    t.handle(delta(1, 'Good '));
    expect(t.textOf(ID)).toBe('Good ');
  });

  it('appends deltas in order', () => {
    const t = new StreamTracker();
    t.handle(delta(1, 'Good '));
    t.handle(delta(2, 'evening'));
    expect(t.textOf(ID)).toBe('Good evening');
  });

  it('ignores a delta after a gap', () => {
    const t = new StreamTracker();
    t.handle(delta(1, 'Good '));
    expect(t.handle(delta(3, 'sir'))).toBeNull();
    expect(t.textOf(ID)).toBe('Good ');
  });

  it('marks a gap', () => {
    const t = new StreamTracker();
    t.handle(delta(2, 'late'));
    expect(t.stateOf(ID)?.gap).toBe(true);
  });

  it('ignores later deltas while a gap is open', () => {
    const t = new StreamTracker();
    t.handle(delta(2, 'late'));
    t.handle(delta(1, 'early'));
    expect(t.textOf(ID)).toBe('');
  });

  it('replaces the text with a snapshot and closes the gap', () => {
    const t = new StreamTracker();
    t.handle(delta(2, 'late'));
    t.handle(snapshot(2, 'Good evening'));
    expect(t.stateOf(ID)).toMatchObject({ text: 'Good evening', gap: false });
  });

  it('goes on from the snapshot number', () => {
    const t = new StreamTracker();
    t.handle(snapshot(4, 'Good evening'));
    t.handle(delta(5, ', sir'));
    expect(t.textOf(ID)).toBe('Good evening, sir');
  });

  it('replaces the text with the value at the end', () => {
    const t = new StreamTracker();
    t.handle(delta(1, 'Good eve'));
    t.handle(done('Good evening.'));
    expect(t.stateOf(ID)).toMatchObject({ text: 'Good evening.', finished: true, status: 'ok' });
  });

  it('repairs a gap with the end', () => {
    const t = new StreamTracker();
    t.handle(delta(2, 'late'));
    t.handle(done('The whole text.'));
    expect(t.textOf(ID)).toBe('The whole text.');
  });

  it('ignores messages after the end', () => {
    const t = new StreamTracker();
    t.handle(done('Done.'));
    expect(t.handle(delta(1, 'more'))).toBeNull();
    expect(t.textOf(ID)).toBe('Done.');
  });

  it('shows a failure fallback as the text', () => {
    const t = new StreamTracker();
    t.handle(done('The butler says nothing.', 'failed'));
    expect(t.stateOf(ID)).toMatchObject({ text: 'The butler says nothing.', status: 'failed' });
  });

  it('keeps a stream no entry has listed yet', () => {
    const t = new StreamTracker();
    t.handle(delta(1, 'early', 'str-unlisted'));
    expect(t.textOf('str-unlisted')).toBe('early');
  });

  it('fills a placeholder with the text so far', () => {
    const t = new StreamTracker();
    t.handle(delta(1, 'Good evening'));
    expect(t.fillStreams(`The butler says: ${streamPlaceholder(ID)}`)).toBe('The butler says: Good evening');
  });

  it('fills the placeholder of a stream nothing has arrived of with nothing', () => {
    expect(new StreamTracker().fillStreams(`Wait: ${streamPlaceholder('str-9')}.`)).toBe('Wait: .');
  });

  it('leaves a text without placeholders alone', () => {
    expect(new StreamTracker().fillStreams('Plain {text}')).toBe('Plain {text}');
  });

  it('forgets everything on clear', () => {
    const t = new StreamTracker();
    t.handle(delta(1, 'x'));
    t.clear();
    expect(t.stateOf(ID)).toBeUndefined();
  });
});

describe('streams: entries and messages', () => {
  it('reads the stream ids of an entry', () => {
    expect(streamIdsOf({ narration: 'x', 'stream-ids': ['str-1', 'str-2'] })).toEqual(['str-1', 'str-2']);
  });

  it('finds no stream ids in an entry without them', () => {
    expect(streamIdsOf({ narration: 'x' })).toEqual([]);
  });

  it('parses a delta from JSON', () => {
    expect(parseStreamMessage('{"stream-id":"str-1","no":1,"delta":"hi"}')).toEqual(delta(1, 'hi'));
  });

  it('parses an end', () => {
    expect(parseStreamMessage(done('x'))).toEqual(done('x'));
  });

  it('rejects a message without a stream id', () => {
    expect(parseStreamMessage({ no: 1, delta: 'hi' })).toBeNull();
  });

  it('rejects text that is not JSON', () => {
    expect(parseStreamMessage('not json')).toBeNull();
  });
});

describe('StreamConnection', () => {
  it('opens the stream command with the token over EventSource', () => {
    const es = fakeEventSource();
    new StreamConnection({ baseUrl: BASE, clientType: 'browser', streamToken: 'tok', eventSource: es.factory, onMessage: () => {} }).start();
    const url = new URL(es.opened[0].url);
    expect([url.searchParams.get('cmd'), url.searchParams.get('stream-token')]).toEqual(['stream', 'tok']);
  });

  it('hands on the messages it receives', () => {
    const es = fakeEventSource();
    const received: StreamMessage[] = [];
    new StreamConnection({ baseUrl: BASE, clientType: 'browser', streamToken: 'tok', eventSource: es.factory, onMessage: (m) => received.push(m) }).start();
    es.emit(delta(1, 'hi'));
    expect(received).toEqual([delta(1, 'hi')]);
  });

  it('skips data that is no message', () => {
    const es = fakeEventSource();
    const received: StreamMessage[] = [];
    new StreamConnection({ baseUrl: BASE, clientType: 'browser', streamToken: 'tok', eventSource: es.factory, onMessage: (m) => received.push(m) }).start();
    es.emit('garbage');
    expect(received).toEqual([]);
  });

  it('closes the EventSource on stop', () => {
    const es = fakeEventSource();
    const connection = new StreamConnection({ baseUrl: BASE, clientType: 'browser', streamToken: 'tok', eventSource: es.factory, onMessage: () => {} });
    connection.start();
    connection.stop();
    expect(es.opened[0].source.closed).toBe(true);
  });

  it('polls stream-poll and hands on its events', async () => {
    const server = fakeServer({ 'stream-events': [delta(1, 'polled')] });
    const received: StreamMessage[] = [];
    const connection = new StreamConnection({ baseUrl: BASE, clientType: 'browser', streamToken: 'tok', eventSource: null, fetch: server.fetch, onMessage: (m) => received.push(m) });
    await connection.poll();
    expect([server.requests[0].cmd, server.requests[0]['stream-token'], received]).toEqual(['stream-poll', 'tok', [delta(1, 'polled')]]);
  });
});

describe('MagidClient: streams', () => {
  const sessionWithStreams = { 'session-id': 'sess-1', 'file-request-token': 'tok-1', 'stream-token': 'stream-tok' };
  const menu = { menu: 'hall', 'menu-description': 'A hall.' };

  it('asks for streams with every request when streams are on', async () => {
    const server = fakeServer({ responses: [sessionWithStreams, menu] });
    const c = new MagidClient({ baseUrl: BASE, clientType: 'browser', fetch: server.fetch, streams: true, eventSource: fakeEventSource().factory });
    await c.send('');
    expect(server.requests[0]['accept-streams']).toBe('true');
  });

  it('does not ask for streams when they are off', async () => {
    const server = fakeServer({ responses: [sessionWithStreams, menu] });
    const c = new MagidClient({ baseUrl: BASE, clientType: 'browser', fetch: server.fetch });
    await c.send('');
    expect(server.requests[0]['accept-streams']).toBeUndefined();
  });

  it('opens the stream connection with the session stream token', async () => {
    const es = fakeEventSource();
    const server = fakeServer({ responses: [sessionWithStreams, menu] });
    const c = new MagidClient({ baseUrl: BASE, clientType: 'browser', fetch: server.fetch, streams: true, eventSource: es.factory });
    await c.send('');
    expect(new URL(es.opened[0].url).searchParams.get('stream-token')).toBe('stream-tok');
  });

  it('keeps each stream text in the state and fills placeholders', async () => {
    const es = fakeEventSource();
    const server = fakeServer({ responses: [sessionWithStreams, menu] });
    const c = new MagidClient({ baseUrl: BASE, clientType: 'browser', fetch: server.fetch, streams: true, eventSource: es.factory });
    await c.send('');
    es.emit(delta(1, 'Good evening'));
    expect([c.getState().streams[ID]?.text, c.fillStreams(`He says: ${streamPlaceholder(ID)}`)])
      .toEqual(['Good evening', 'He says: Good evening']);
  });

  it('announces a changed stream', async () => {
    const es = fakeEventSource();
    const server = fakeServer({ responses: [sessionWithStreams, menu] });
    const c = new MagidClient({ baseUrl: BASE, clientType: 'browser', fetch: server.fetch, streams: true, eventSource: es.factory });
    const seen: string[] = [];
    c.on('stream', (e) => seen.push(`${e.id}:${e.state.text}`));
    await c.send('');
    es.emit(delta(1, 'hi'));
    expect(seen).toEqual([`${ID}:hi`]);
  });

  it('asks for a snapshot after a gap', async () => {
    const es = fakeEventSource();
    const server = fakeServer({ responses: [sessionWithStreams, menu] }, { 'stream-events': [snapshot(3, 'all of it')] });
    const c = new MagidClient({ baseUrl: BASE, clientType: 'browser', fetch: server.fetch, streams: true, eventSource: es.factory });
    await c.send('');
    es.emit(delta(3, 'late'));
    await vi.waitFor(() => expect(c.getState().streams[ID]?.text).toBe('all of it'));
    expect([server.requests[1].cmd, server.requests[1]['stream-id']]).toEqual(['stream-snapshot', ID]);
  });
});

describe('splitStreamPlaceholders', () => {
  it('splits a text at its placeholders', () => {
    expect(splitStreamPlaceholders(`a${streamPlaceholder('s1')}b`)).toEqual(['a', { stream: 's1' }, 'b']);
  });

  it('leaves out empty pieces', () => {
    expect(splitStreamPlaceholders(streamPlaceholder('s1'))).toEqual([{ stream: 's1' }]);
  });

  it('returns a text without placeholders whole', () => {
    expect(splitStreamPlaceholders('plain')).toEqual(['plain']);
  });
});

describe('stream phases', () => {
  it('shows a warm-up message', () => {
    const t = new StreamTracker();
    t.handle(warmUp('The wizard ponders…'));
    expect(t.stateOf(ID)).toMatchObject({ text: 'The wizard ponders…', phase: 'warming-up' });
  });

  it('is receiving after the first text replaces the warm-up', () => {
    const t = new StreamTracker();
    t.handle(warmUp('The wizard ponders…'));
    t.handle(snapshot(0, 'Fix '));
    expect(t.stateOf(ID)).toMatchObject({ text: 'Fix ', phase: 'receiving' });
  });

  it('is receiving after a delta', () => {
    const t = new StreamTracker();
    t.handle(delta(1, 'Fix '));
    expect(t.stateOf(ID)?.phase).toBe('receiving');
  });

  it('is finished at the end', () => {
    const t = new StreamTracker();
    t.handle(done('Fixed.'));
    expect(t.stateOf(ID)?.phase).toBe('finished');
  });

  it('keeps the warm-up marker when parsing', () => {
    expect(parseStreamMessage(JSON.stringify(warmUp('Wait…')))).toEqual(warmUp('Wait…'));
  });
});

describe('streamClassName', () => {
  const tracked = (...messages: StreamMessage[]) => {
    const t = new StreamTracker();
    messages.forEach((m) => t.handle(m));
    return t.stateOf(ID);
  };

  it('marks a stream nothing has arrived of as warming up', () => {
    expect(streamClassName(undefined)).toBe('magid-stream magid-stream-warming-up');
  });

  it('marks a warm-up', () => {
    expect(streamClassName(tracked(warmUp('Wait…')))).toBe('magid-stream magid-stream-warming-up');
  });

  it('marks a receiving stream', () => {
    expect(streamClassName(tracked(delta(1, 'Fix ')))).toBe('magid-stream magid-stream-receiving');
  });

  it('marks a finished stream with its status', () => {
    expect(streamClassName(tracked(done('No.', 'failed')))).toBe('magid-stream magid-stream-finished magid-stream-failed');
  });
});
