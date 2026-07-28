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
  assert.match(renderPreviewHtml({ ...base, source: 'rendered' }), /после исполнения JS/);
  assert.ok(!/после исполнения JS/.test(renderPreviewHtml({ ...base, source: 'static' })));
});

test('escapeHtml экранирует все спецсимволы', () => {
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});
