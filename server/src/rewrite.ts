/**
 * Переписывание ссылок на картинки в снятом HTML.
 * Чистая функция — покрыта юнит-тестами.
 */
import * as cheerio from 'cheerio';

const IMAGE_META_SELECTOR = [
  'meta[property="og:image"]',
  'meta[property="og:image:url"]',
  'meta[property="og:image:secure_url"]',
  'meta[property="twitter:image"]',
  'meta[name="twitter:image"]'
].join(', ');

/** Заменяет в мета-тегах URL сохранённых картинок на публичные. */
export function rewriteImageUrls(html: string, urlMap: Map<string, string>): string {
  if (urlMap.size === 0) return html;
  const $ = cheerio.load(html);
  $(IMAGE_META_SELECTOR).each((_, el) => {
    const content = ($(el).attr('content') ?? '').trim();
    const replacement = urlMap.get(content);
    if (replacement) $(el).attr('content', replacement);
  });
  return $.html();
}
