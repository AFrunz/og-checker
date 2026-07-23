/**
 * Область проверки: решает, нужно ли проверять данный URL.
 *
 * Три взаимоисключающих режима (settings.scopeMode):
 *  - 'single'    — только указанный домен (settings.singleDomain)
 *  - 'blacklist' — все, кроме списка (пустой список = проверять везде)
 *  - 'whitelist' — только домены из списка
 *
 * Синтаксис шаблона: host[:port], регистронезависимый.
 *  - '*' — любая последовательность символов ('*.example.com' — все поддомены)
 *  - шаблон без порта совпадает с любым портом ('localhost' == 'localhost:3000')
 *  - шаблон с портом сверяется вместе с портом ('localhost:3000')
 */
import type { ScopeMode } from './types';

export interface ScopeSettings {
  scopeMode: ScopeMode;
  singleDomain?: string;
  whitelist?: string[];
  blacklist?: string[];
}

export interface ScopeDecision {
  check: boolean;
  reason: string;
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .trim()
    .toLowerCase()
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp('^' + escaped + '$');
}

/** Совпадает ли host[:port] с шаблоном. */
export function hostMatches(pattern: string | undefined, hostname: string, port: string): boolean {
  const p = String(pattern ?? '').trim().toLowerCase();
  if (!p) return false;
  const requiresPort = /:(\d+|\*)$/.test(p);
  // Для URL без явного порта подставляем пустую строку — шаблон с портом не совпадёт.
  const subject = requiresPort ? `${hostname}:${port}` : hostname;
  try {
    return patternToRegex(p).test(subject.toLowerCase());
  } catch {
    return false;
  }
}

function matchesAny(patterns: string[] | undefined, hostname: string, port: string): boolean {
  return (patterns ?? []).some((p) => hostMatches(p, hostname, port));
}

/** Нужно ли проверять URL при данных настройках. */
export function shouldCheckUrl(urlStr: string, settings: ScopeSettings): ScopeDecision {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return { check: false, reason: 'invalid-url' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { check: false, reason: 'unsupported-protocol' };
  }
  const { hostname, port } = url;

  switch (settings.scopeMode) {
    case 'single': {
      const ok = hostMatches(settings.singleDomain, hostname, port);
      return { check: ok, reason: ok ? 'single-match' : 'single-mismatch' };
    }
    case 'whitelist': {
      const ok = matchesAny(settings.whitelist, hostname, port);
      return { check: ok, reason: ok ? 'whitelisted' : 'not-whitelisted' };
    }
    case 'blacklist':
    default: {
      const blocked = matchesAny(settings.blacklist, hostname, port);
      return { check: !blocked, reason: blocked ? 'blacklisted' : 'not-blacklisted' };
    }
  }
}

/** Парсит текст со списком доменов (по строке на шаблон, # — комментарий). */
export function parseDomainList(text: string): string[] {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && !s.startsWith('#'));
}
