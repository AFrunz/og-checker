/**
 * Генерация синтетической превью-страницы из набора мета-тегов.
 *
 * Мы не храним чужой HTML: страница собирается заново из тегов с полным
 * экранированием значений. Краулер видит корректный <head> с метаданными,
 * человек — небольшую справочную страницу с таблицей тегов.
 */

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
}

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
  const metas = input.tags
    .map((t) => `  <meta ${metaAttr(t.key)}="${escapeHtml(t.key)}" content="${escapeHtml(t.value)}">`)
    .join('\n');

  const rows = input.tags
    .map((t) => `      <tr><td>${escapeHtml(t.key)}</td><td>${escapeHtml(t.value)}</td></tr>`)
    .join('\n');

  const sourceNote =
    input.source === 'rendered'
      ? '<p class="warn">Теги сняты из DOM после исполнения JS — реальный краулер может видеть страницу иначе.</p>'
      : '';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.title || 'OG Checker preview')}</title>
${metas}
</head>
<body>
  <main style="max-width:640px;margin:40px auto;font:14px/1.5 system-ui,sans-serif;color:#333;padding:0 16px">
    <h1 style="font-size:18px">Превью-страница OG Checker</h1>
    <p>Временная копия метаданных страницы <a href="${escapeHtml(input.pageUrl)}" rel="nofollow noopener">${escapeHtml(input.pageUrl)}</a> для проверки OpenGraph-разметки соц-краулерами.</p>
    ${sourceNote}
    <table border="1" cellpadding="6" style="border-collapse:collapse;font-size:13px;word-break:break-all">
      <tr><th>Тег</th><th>Значение</th></tr>
${rows}
    </table>
  </main>
</body>
</html>
`;
}
