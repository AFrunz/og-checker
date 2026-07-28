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
  /** Физический размер файла в байтах. */
  bytes?: number;
}

export type ImageInfoMap = Record<string, ImageInfo>;

export type ScopeMode = 'single' | 'blacklist' | 'whitelist';
export type ImageMode = 'all' | 'unavailable' | 'none';
export type Lang = 'en' | 'ru';

export interface Settings {
  enabled: boolean;
  language: Lang;
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

/** Источник тегов для серверной сессии: статический HTML или DOM после JS. */
export type TagSource = 'static' | 'rendered';

export interface ServerSession {
  id: string;
  publicUrl: string;
  expiresAt: number;
  ownerToken: string;
  serverUrl: string;
  pageUrl: string;
  createdAt: number;
  source: TagSource;
}

export interface UploadImage {
  url: string;
  contentType: string;
  dataB64: string;
}

/**
 * Ответ content script на запрос снимка страницы.
 * tags — из живого DOM (после JS); staticTags — из исходного HTML
 * (fetch + DOMParser, JS не исполняется), null — исходник получить не удалось.
 */
export interface PageSnapshot {
  url: string;
  title: string;
  tags: MetaTag[];
  staticTags: MetaTag[] | null;
}
