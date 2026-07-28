/**
 * Генерация синтетической превью-страницы из набора мета-тегов.
 *
 * Мы не храним чужой HTML: страница собирается заново из тегов с полным
 * экранированием значений. Краулер видит корректный <head> с метаданными,
 * человек — небольшую справочную страницу с таблицей тегов.
 * Язык человекочитаемой части задаётся расширением (по умолчанию английский).
 */

export type PreviewLang = 'en' | 'ru';

export interface PreviewTag {
  key: string;
  value: string;
}

export interface PreviewInput {
  title: string;
  pageUrl: string;
  tags: PreviewTag[];
  /** 'static' — теги из исходного HTML; 'rendered' — из DOM после JS. */
  source: 'static' | 'rendered';
  lang?: PreviewLang;
}

const STRINGS: Record<PreviewLang, Record<string, string>> = {
  en: {
    fallbackTitle: 'OG Checker preview',
    heading: 'OG Checker preview page',
    intro: 'A temporary copy of the metadata of {url} for checking OpenGraph markup with social crawlers.',
    renderedWarn: 'Tags were captured from the DOM after JS execution — a real crawler may see the page differently.',
    thTag: 'Tag',
    thValue: 'Value'
  },
  ru: {
    fallbackTitle: 'Превью OG Checker',
    heading: 'Превью-страница OG Checker',
    intro: 'Временная копия метаданных страницы {url} для проверки OpenGraph-разметки соц-краулерами.',
    renderedWarn: 'Теги сняты из DOM после исполнения JS — реальный краулер может видеть страницу иначе.',
    thTag: 'Тег',
    thValue: 'Значение'
  }
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** twitter:* исторически задаются через name, остальные (og:, fb:, …) — через property. */
function metaAttr(key: string): 'name' | 'property' {
  return key.startsWith('twitter:') ? 'name' : 'property';
}

export function renderPreviewHtml(input: PreviewInput): string {
  const lang: PreviewLang = input.lang === 'ru' ? 'ru' : 'en';
  const s = STRINGS[lang];

  const metas = input.tags
    .map((t) => `  <meta ${metaAttr(t.key)}="${escapeHtml(t.key)}" content="${escapeHtml(t.value)}">`)
    .join('\n');

  const rows = input.tags
    .map((t) => `      <tr><td>${escapeHtml(t.key)}</td><td>${escapeHtml(t.value)}</td></tr>`)
    .join('\n');

  const link = `<a href="${escapeHtml(input.pageUrl)}" rel="nofollow noopener">${escapeHtml(input.pageUrl)}</a>`;
  const intro = escapeHtml(s.intro).replace('{url}', link);

  const sourceNote = input.source === 'rendered' ? `<p class="warn">${escapeHtml(s.renderedWarn)}</p>` : '';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.title || s.fallbackTitle)}</title>
${metas}
</head>
<body>
  <main style="max-width:640px;margin:40px auto;font:14px/1.5 system-ui,sans-serif;color:#333;padding:0 16px">
    <h1 style="font-size:18px">${escapeHtml(s.heading)}</h1>
    <p>${intro}</p>
    ${sourceNote}
    <table border="1" cellpadding="6" style="border-collapse:collapse;font-size:13px;word-break:break-all">
      <tr><th>${escapeHtml(s.thTag)}</th><th>${escapeHtml(s.thValue)}</th></tr>
${rows}
    </table>
  </main>
</body>
</html>
`;
}
