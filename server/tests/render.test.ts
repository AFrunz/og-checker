import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, renderPreviewHtml } from '../src/render';

test('значения тегов экранируются (XSS не проходит)', () => {
  const html = renderPreviewHtml({
    title: '</title><script>alert(1)</script>',
    pageUrl: 'http://localhost/"><img src=x onerror=alert(1)>',
    source: 'static',
    tags: [{ key: 'og:title', value: '"><script>alert(1)</script>' }]
  });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&quot;&gt;'));
});

test('og:* рендерится через property, twitter:* — через name', () => {
  const html = renderPreviewHtml({
    title: 'T',
    pageUrl: 'http://localhost/',
    source: 'static',
    tags: [
      { key: 'og:title', value: 'A' },
      { key: 'twitter:card', value: 'summary' }
    ]
  });
  assert.ok(html.includes('<meta property="og:title" content="A">'));
  assert.ok(html.includes('<meta name="twitter:card" content="summary">'));
});

test('rendered-источник добавляет предупреждение, static — нет', () => {
  const base = { title: 'T', pageUrl: 'http://localhost/', tags: [] };
  assert.match(renderPreviewHtml({ ...base, source: 'rendered' }), /after JS execution/);
  assert.ok(!/after JS execution/.test(renderPreviewHtml({ ...base, source: 'static' })));
});

test('локализация превью: en по умолчанию, ru по запросу', () => {
  const base = { title: 'T', pageUrl: 'http://localhost/', tags: [], source: 'static' as const };
  const en = renderPreviewHtml(base);
  assert.match(en, /<html lang="en">/);
  assert.match(en, /OG Checker preview page/);
  const ru = renderPreviewHtml({ ...base, lang: 'ru', source: 'rendered' });
  assert.match(ru, /<html lang="ru">/);
  assert.match(ru, /Превью-страница OG Checker/);
  assert.match(ru, /после исполнения JS/);
});

test('escapeHtml экранирует все спецсимволы', () => {
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});
