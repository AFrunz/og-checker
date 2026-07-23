/**
 * Утилиты для работы с URL картинок:
 *  - резолв относительных ссылок против URL страницы;
 *  - эвристика «локальный/приватный адрес» для режима сохранения
 *    «только недоступные» (краулер снаружи такие URL не достанет).
 */

export function resolveUrl(raw: string, baseUrl: string): string | null {
  try {
    return new URL(raw, baseUrl).href;
  } catch {
    return null;
  }
}

const PRIVATE_HOST_RE = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.test)$/i;

function isPrivateIp(host: string): boolean {
  // IPv4
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  // IPv6 loopback / link-local / ULA
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  return h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd');
}

/** Недоступен ли URL для внешнего краулера (локальный/приватный адрес). */
export function isPrivateUrl(urlStr: string): boolean {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return true;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
  return PRIVATE_HOST_RE.test(url.hostname) || isPrivateIp(url.hostname);
}
