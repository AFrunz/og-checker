import test from 'node:test';
import assert from 'node:assert/strict';

import { isPrivateUrl, resolveUrl } from '../src/lib/urlutils';

test('resolveUrl резолвит относительные ссылки', () => {
  assert.equal(resolveUrl('/img/a.png', 'http://localhost:3000/page'), 'http://localhost:3000/img/a.png');
  assert.equal(resolveUrl('https://cdn.x.com/a.png', 'http://localhost/'), 'https://cdn.x.com/a.png');
  assert.equal(resolveUrl('%%%', ''), null);
});

test('локальные и приватные адреса определяются как недоступные извне', () => {
  for (const url of [
    'http://localhost/a.png',
    'http://localhost:3000/a.png',
    'http://app.localhost/a.png',
    'http://127.0.0.1/a.png',
    'http://10.1.2.3/a.png',
    'http://192.168.1.10/a.png',
    'http://172.20.0.5/a.png',
    'http://[::1]/a.png',
    'http://myhost.local/a.png',
    'file:///tmp/a.png'
  ]) {
    assert.ok(isPrivateUrl(url), url + ' должен быть приватным');
  }
});

test('публичные адреса не считаются приватными', () => {
  for (const url of ['https://cdn.example.com/a.png', 'http://8.8.8.8/a.png', 'https://172.32.0.1/x']) {
    assert.ok(!isPrivateUrl(url), url + ' должен быть публичным');
  }
});
