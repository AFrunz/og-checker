/** Общие типы расширения. */

export interface MetaTag {
  key: string;
  value: string;
}

export type Level = 'ok' | 'warning' | 'error';

export interface ImageRule {
  /** Тег с URL картинки (og:image / twitter:image). */
  tag: string;
  /** Тег-замена, если основного нет (twitter:image -> og:image). */
  fallbackTag?: string;
  reachable?: boolean;
  minWidth?: number;
  minHeight?: number;
  recommendedWidth?: number;
  recommendedHeight?: number;
}

export interface Profile {
  id: string;
  name: string;
  /** Отсутствие/пустое значение -> error. */
  required: string[];
  /** Отсутствие -> warning. */
  recommended: string[];
  /** { тег: тег-замена } — фолбэк, который делает краулер. */
  fallbacks?: Record<string, string>;
  image?: ImageRule;
}

export interface Check {
  tag: string;
  status: Level;
  value: string | null;
  message: string;
}

export interface NetworkReport {
  id: string;
  name: string;
  level: Level;
  checks: Check[];
}

export interface Report {
  level: Level;
  networks: NetworkReport[];
  tagCount: number;
}

export interface ImageInfo {
  reachable: boolean;
  width?: number;
  height?: number;
}

export type ImageInfoMap = Record<string, ImageInfo>;

export type ScopeMode = 'single' | 'blacklist' | 'whitelist';
export type ImageMode = 'all' | 'unavailable' | 'none';

export interface Settings {
  enabled: boolean;
  networks: string[];
  scopeMode: ScopeMode;
  singleDomain: string;
  whitelist: string[];
  blacklist: string[];
  imageMode: ImageMode;
  serverUrl: string;
  serverTtlMinutes: number;
}

export type TabStatus = 'disabled' | 'skipped' | 'busy' | 'done';

export interface TabResult {
  status: TabStatus;
  url: string;
  reason?: string;
  tags?: MetaTag[];
  report?: Report;
  checkedAt?: number;
}

export interface ServerSession {
  id: string;
  publicUrl: string;
  expiresAt: number;
  ownerToken: string;
  serverUrl: string;
  pageUrl: string;
  createdAt: number;
}

export interface UploadImage {
  url: string;
  contentType: string;
  dataB64: string;
}

/** Ответ content script на запрос HTML. */
export interface PageSnapshot {
  html: string;
  url: string;
  title: string;
  tags: MetaTag[];
}
