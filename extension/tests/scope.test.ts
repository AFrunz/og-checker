import test from 'node:test';
import assert from 'node:assert/strict';

import { hostMatches, parseDomainList, shouldCheckUrl, type ScopeSettings } from '../src/lib/scope';

test('точный домен, любой порт', () => {
  assert.ok(hostMatches('localhost', 'localhost', ''));
  assert.ok(hostMatches('localhost', 'localhost', '3000'));
  assert.ok(!hostMatches('localhost', 'example.com', ''));
});

test('шаблон с портом требует совпадения порта', () => {
  assert.ok(hostMatches('localhost:3000', 'localhost', '3000'));
  assert.ok(!hostMatches('localhost:3000', 'localhost', '5173'));
  assert.ok(!hostMatches('localhost:3000', 'localhost', ''));
});

test('wildcard-поддомены', () => {
  assert.ok(hostMatches('*.example.com', 'dev.example.com', ''));
  assert.ok(hostMatches('*.example.com', 'a.b.example.com', ''));
  assert.ok(!hostMatches('*.example.com', 'example.com', ''));
});

test('режим single', () => {
  const s: ScopeSettings = { scopeMode: 'single', singleDomain: 'localhost:5173' };
  assert.ok(shouldCheckUrl('http://localhost:5173/page', s).check);
  assert.ok(!shouldCheckUrl('http://localhost:3000/page', s).check);
});

test('режим blacklist: пустой список = проверять везде', () => {
  const s: ScopeSettings = { scopeMode: 'blacklist', blacklist: [] };
  assert.ok(shouldCheckUrl('https://any.site/', s).check);
});

test('режим blacklist исключает домены из списка', () => {
  const s: ScopeSettings = { scopeMode: 'blacklist', blacklist: ['*.google.com', 'example.com'] };
  assert.ok(!shouldCheckUrl('https://docs.google.com/', s).check);
  assert.ok(!shouldCheckUrl('https://example.com/x', s).check);
  assert.ok(shouldCheckUrl('https://other.com/', s).check);
});

test('режим whitelist пропускает только из списка', () => {
  const s: ScopeSettings = { scopeMode: 'whitelist', whitelist: ['localhost', '*.dev.example.com'] };
  assert.ok(shouldCheckUrl('http://localhost:8080/', s).check);
  assert.ok(shouldCheckUrl('https://app.dev.example.com/', s).check);
  assert.ok(!shouldCheckUrl('https://example.com/', s).check);
});

test('не-http протоколы не проверяются', () => {
  const s: ScopeSettings = { scopeMode: 'blacklist', blacklist: [] };
  assert.ok(!shouldCheckUrl('chrome://extensions', s).check);
  assert.ok(!shouldCheckUrl('file:///tmp/x.html', s).check);
});

test('parseDomainList: пустые строки и комментарии отбрасываются', () => {
  assert.deepEqual(parseDomainList('example.com\n\n# comment\n *.Foo.RU '), ['example.com', '*.foo.ru']);
});
