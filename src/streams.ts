// Streamed texts (the server's development-docs/STREAMING-DESIGN.md): a tag goes on producing text after the response,
// and the server sends it over one SSE connection per session. An entry that streams lists its streams in `stream-ids`
// and holds each stream's placeholder `⟪stream:<id>⟫` where the text goes.
//
// Two parts, both free of any framework:
// - StreamTracker: the client's rules for the messages, and the texts so far. Pure: feed it messages, read texts.
// - StreamConnection: opens the session's SSE connection (or polls without EventSource) and hands each message on.
import { buildCommandUrl, type FetchLike } from './transport.ts';

export const STREAM_PLACEHOLDER_START = '⟪stream:';
export const STREAM_PLACEHOLDER_END = '⟫';
const PLACEHOLDER = /⟪stream:([^⟫\s]+)⟫/g;

// The commands and parameters of the stream protocol.
export const STREAM_COMMAND = 'stream';
export const STREAM_POLL_COMMAND = 'stream-poll';
export const STREAM_SNAPSHOT_COMMAND = 'stream-snapshot';
export const STREAM_TOKEN_PARAM = 'stream-token';
export const STREAM_ID_PARAM = 'stream-id';
export const ACCEPT_STREAMS_PARAM = 'accept-streams';

export function streamPlaceholder(id: string): string {
  return STREAM_PLACEHOLDER_START + id + STREAM_PLACEHOLDER_END;
}

// The streams an entry lists (`stream-ids`); none for an entry that doesn't stream.
export function streamIdsOf(entry: unknown): string[] {
  const ids = (entry as { 'stream-ids'?: unknown } | null)?.['stream-ids'];
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

export type StreamStatus = 'ok' | 'failed' | 'cancelled' | 'timeout';

export type StreamMessage =
  | { 'stream-id': string; no: number; delta: string }
  | { 'stream-id': string; no: number; snapshot: string }
  | { 'stream-id': string; done: true; status: StreamStatus | string; value: string };

// What a client knows of one stream.
export interface StreamState {
  text: string;
  // The last delta's number applied (or the number a snapshot stands at).
  no: number;
  // A delta was missed: deltas are ignored until a snapshot or the end. Ask for a snapshot (StreamConnection does).
  gap: boolean;
  finished: boolean;
  // Set when finished.
  status?: string;
}

// One SSE `data:` line or one element of `stream-events`, as a message; null if it isn't one.
export function parseStreamMessage(data: unknown): StreamMessage | null {
  let value = data;
  if (typeof data === 'string') {
    try {
      value = JSON.parse(data);
    } catch {
      return null;
    }
  }
  const m = value as Record<string, unknown> | null;
  if (!m || typeof m['stream-id'] !== 'string') return null;
  if (m.done === true && typeof m.value === 'string') return m as unknown as StreamMessage;
  if (typeof m.no !== 'number') return null;
  if (typeof m.delta === 'string' || typeof m.snapshot === 'string') return m as unknown as StreamMessage;
  return null;
}

// The client's rules (STREAMING-DESIGN.md §4):
// 1. a delta numbered last + 1 is appended; any other number is a gap: deltas are ignored until a snapshot or the end;
// 2. a snapshot replaces the text and sets the number deltas go on from;
// 3. the end replaces the text with its value, whatever came before;
// 4. messages of streams no entry has listed yet are kept all the same (an entry may still come);
// 5. stream text is plain text: insert it as text, never as markup (fillStreams returns text for a text node).
export class StreamTracker {
  private readonly streams = new Map<string, StreamState>();

  // Applies a message. Returns the stream's state when it changed, null when the message was ignored.
  handle(message: StreamMessage): StreamState | null {
    const id = message['stream-id'];
    const state = this.streams.get(id) ?? { text: '', no: 0, gap: false, finished: false };
    if (state.finished) return null;
    if ('done' in message) {
      Object.assign(state, { text: message.value, finished: true, status: message.status, gap: false });
    } else if ('snapshot' in message) {
      Object.assign(state, { text: message.snapshot, no: message.no, gap: false });
    } else if (state.gap) {
      return null;
    } else if (message.no === state.no + 1) {
      state.text += message.delta;
      state.no = message.no;
    } else {
      state.gap = true;
      this.streams.set(id, state);
      return null;
    }
    this.streams.set(id, state);
    return { ...state };
  }

  // The stream's text so far; '' for a stream nothing has arrived of.
  textOf(id: string): string {
    return this.streams.get(id)?.text ?? '';
  }

  stateOf(id: string): StreamState | undefined {
    const state = this.streams.get(id);
    return state ? { ...state } : undefined;
  }

  // Replaces each placeholder in a text with its stream's text so far.
  fillStreams(text: string): string {
    if (!text.includes(STREAM_PLACEHOLDER_START)) return text;
    return text.replace(PLACEHOLDER, (_, id: string) => this.textOf(id));
  }

  // Forgets every stream (a new story, a new session).
  clear(): void {
    this.streams.clear();
  }
}

// The parts of EventSource the connection uses; inject one for tests or a polyfill.
export interface EventSourceLike {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  close(): void;
}
export type EventSourceFactory = (url: string) => EventSourceLike;

export interface StreamConnectionOptions {
  baseUrl: string;
  clientType: string;
  streamToken: string;
  // Called for every message, in order.
  onMessage: (message: StreamMessage) => void;
  // Defaults to globalThis.EventSource; without one, the connection polls.
  eventSource?: EventSourceFactory | null;
  fetch?: FetchLike;
  // How often to poll without EventSource (ms). Default 1000.
  pollIntervalMs?: number;
}

function defaultEventSource(): EventSourceFactory | null {
  const Ctor = (globalThis as { EventSource?: new (url: string) => EventSourceLike }).EventSource;
  return Ctor ? (url) => new Ctor(url) : null;
}

// The session's stream connection: SSE when available (it reconnects by itself, and the server starts every connection
// with the snapshots), else polling `cmd=stream-poll`. One per session: the server ends an older connection when a newer
// one opens.
export class StreamConnection {
  private readonly options: StreamConnectionOptions;
  private source: EventSourceLike | null = null;
  private timer: unknown = null;
  private polling = false;

  constructor(options: StreamConnectionOptions) {
    this.options = options;
  }

  start(): void {
    this.stop();
    const factory = this.options.eventSource === undefined ? defaultEventSource() : this.options.eventSource;
    if (factory) {
      this.source = factory(this.url(STREAM_COMMAND));
      this.source.onmessage = (event) => this.deliver(event.data);
      return;
    }
    this.timer = setInterval(() => void this.poll(), this.options.pollIntervalMs ?? 1000);
  }

  stop(): void {
    this.source?.close();
    this.source = null;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  get isOpen(): boolean {
    return this.source !== null || this.timer !== null;
  }

  // One poll: `cmd=stream-poll`, each message handed on. Exposed for tests and for clients that poll on their own.
  async poll(): Promise<void> {
    if (this.polling) return;
    const fetchImpl = this.options.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (!fetchImpl) return;
    this.polling = true;
    try {
      const res = await fetchImpl(this.url(STREAM_POLL_COMMAND));
      if (!res.ok) return;
      const events = (JSON.parse(await res.text()) as { 'stream-events'?: unknown[] })['stream-events'] ?? [];
      for (const event of events) this.deliver(event);
    } catch {
      // a lost poll: the next one, or a snapshot, makes up for it
    } finally {
      this.polling = false;
    }
  }

  private deliver(data: unknown): void {
    const message = parseStreamMessage(data);
    if (message) this.options.onMessage(message);
  }

  private url(command: string): string {
    return buildCommandUrl({ baseUrl: this.options.baseUrl, clientType: this.options.clientType }, command,
      { [STREAM_TOKEN_PARAM]: this.options.streamToken });
  }
}
