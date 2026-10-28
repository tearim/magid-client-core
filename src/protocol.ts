export interface MenuOption {
  'command-name': string;
  'command-description': string;
  'command-class'?: string;
}

export interface MenuResponse {
  menu?: string;
  'menu-name'?: string;
  'menu-description'?: string;
  'menu-options'?: MenuOption[];
  'menu-class'?: string;
  'menu-css'?: string;
  'menu-background-music'?: string;
  // Populated client-side (MagidClient) with the detached elements of the same response batch that no narration
  // claimed — not present on the wire on this object.
  'detached-elements'?: DetachedElementResponse[];
}

// An element whose markup lives outside the normal element stream. MagidClient hands it to the narration whose text
// contains its `text-anchor`, otherwise to the menu of the same batch; the renderer puts it in place of the anchor
// (`by-anchor`, see `prepareDisplayText`'s `anchors`) or before/after the menu description.
export interface DetachedElementResponse {
  detached: 'by-anchor' | 'append' | 'prepend';
  'text-anchor'?: string;
  'element-type': string;
  css?: string;
  class?: string;
  // element-type: 'input'
  'input-type'?: string;
  'input-label'?: string;
  'input-name'?: string;
  'input-value'?: string;
  'input-async'?: string;
  // element-type: 'image' (the server sends `detached: 'by-anchor'` with `text-anchor`; the parser relies on
  // `text-anchor` and sets `by-anchor` itself, so engines from before 2026-10-28 that sent no `detached` still work)
  image?: string;
  alt?: string;
  width?: string;
  height?: string;
}

// An image on its own (`<img>` outside a text): `element-type` "image" without `text-anchor`. `image` is the URL,
// `magid:///` already resolved; files from the server still need the file-request-token (`withFileRequestToken`).
// `width`/`height` are as the author wrote them (a bare number means pixels, as in HTML).
export interface ImageResponse {
  'element-type': 'image';
  image: string;
  alt?: string;
  width?: string;
  height?: string;
  class?: string;
  css?: string;
  defer?: string;
}

export interface NarrationResponse {
  narration?: string;
  text?: string;
  class?: string;
  css?: string;
  defer?: string;
  // `<show image="…">`: an image shown with the narration (an output field; `magid:///` already resolved).
  image?: string;
  // Populated client-side (MagidClient): the batch's detached elements whose `text-anchor` is in this text.
  'detached-elements'?: DetachedElementResponse[];
}

export interface CommandResponse {
  'command-name': string;
  'command-description': string;
  'command-class'?: string;
  'command-css'?: string;
  'command-defer'?: string;
}

export interface ConfigData {
  'css-files'?: string;
  'css-files-react'?: string;
  'freshness-key'?: string;
  'view-port'?: string;
  'menu-position'?: string;
  [key: string]: string | undefined;
}

export interface ConfigResponse {
  config: ConfigData;
}

export interface VisualResponse {
  visual: string;
  'transition-type'?: 'fade' | 'unfade';
  'transition-length'?: string;
  'transition-target'?: string;
  'transition-blocking'?: string;
}

export interface ResponsesWrapper {
  responses: ServerResponse[];
}

export type ServerResponse =
  | MenuResponse
  | NarrationResponse
  | CommandResponse
  | ConfigResponse
  | VisualResponse
  | DetachedElementResponse
  | ImageResponse
  | ResponsesWrapper;

export interface XmlEntry {
  name: string;
  description: string;
  path: string;
  absolutePath: string;
}

export interface ServerStatus {
  xmlPath: string;
  [key: string]: string;
}

export interface ServerErrorPayload {
  status: 'error';
  code?: string;
  message?: string;
  'freshness-key'?: string;
  'current-scene'?: string;
}

export interface SessionResponse {
  'session-id': string;
  'file-request-token': string;
  'available-xmls'?: XmlEntry[];
  'server-name'?: string;
  'server-version'?: string;
  'server-description'?: string;
  'server-icon'?: string;
}

export interface ServerStatsHeader {
  'session-count': number;
  'session-max': number;
  'session-ttl': number;
  'session-short-ttl': number;
  'session-next-evict': number;
  'session-next-evict-explanation'?: string;
  [key: string]: unknown;
}

export interface ServerStatsSession {
  'is-admin': boolean;
  'uid-hash': number;
  'file-path': string;
  'is-short-lived': boolean;
  'command-count': number;
  'file-request-count': number;
  'last-active-time': number;
  'last-active-time-explanation'?: string;
  [key: string]: unknown;
}

export interface ServerStats {
  header: ServerStatsHeader;
  sessions: ServerStatsSession[];
}
