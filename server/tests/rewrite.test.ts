import test from 'node:test';
import assert from 'node:assert/strict';
import { rewriteImageUrls } from '../src/rewrite';

const HTML = `<!DOCTYPE html><html><head>
<meta property="og:title" content="Тест" />
<meta property="og:image" content="http://localhost:3000/img/pic.png" />
<meta property="og:image" content="https://cdn.example.com/pub.png" />
<meta name="twitter:image" content="http://localhost:3000/img/pic.png" />
</head><body><p>hi</p></body></html>`;

test('переписывает только сохранённые URL', () => {
  const map = new Map([['http://localhost:3000/img/pic.png', 'https://og.example.com/s/abc/img/0']]);
  const out = rewriteImageUrls(HTML, map);
  assert.ok(!out.includes('content="http://localhost:3000/img/pic.png"'));
  assert.ok(out.includes('https://og.example.com/s/abc/img/0'));
  // публичная картинка не тронута
  assert.ok(out.includes('https://cdn.example.com/pub.png'));
  // переписаны и og:image, и twitter:image
  assert.equal(out.split('https://og.example.com/s/abc/img/0').length - 1, 2);
});

test('пустая карта — HTML не меняется', () => {
  assert.equal(rewriteImageUrls(HTML, new Map()), HTML);
});
