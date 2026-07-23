/** Парсер OG/Twitter/FB мета-тегов из документа. */
import type { MetaTag } from './types';

const META_PREFIXES = ['og:', 'fb:', 'twitter:', 'article:', 'profile:', 'video:', 'music:', 'book:'];

/** Собирает мета-теги из документа с сохранением порядка и дублей. */
export function collectMetaTags(doc: Document): MetaTag[] {
  const tags: MetaTag[] = [];
  const metas = doc.querySelectorAll('meta[property], meta[name]');
  for (const meta of metas) {
    const key = (meta.getAttribute('property') || meta.getAttribute('name') || '').trim().toLowerCase();
    if (!key) continue;
    if (!META_PREFIXES.some((p) => key.startsWith(p))) continue;
    tags.push({ key, value: (meta.getAttribute('content') || '').trim() });
  }
  return tags;
}

/** Первое значение тега или null. */
export function getTag(tags: MetaTag[], key: string): string | null {
  const found = tags.find((t) => t.key === key);
  return found ? found.value : null;
}

/** Все значения тега (og:image может повторяться). */
export function getTagAll(tags: MetaTag[], key: string): string[] {
  return tags.filter((t) => t.key === key).map((t) => t.value);
}
