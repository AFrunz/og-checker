/**
 * Интеграционные тесты API на in-memory заглушке Redis.
 * Покрывают: создание сессии, статус, продление, остановку, права владельца,
 * раздачу статики/картинок, переписывание URL, лимиты.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../src/app';
import type { RedisLike } from '../src/store';

interface Record_ {
  fields: Map<string, string>;
  expiresAt: number | null;
}

class FakeRedis implements RedisLike {
  private data = new Map<string, Record_>();

  private live(key: string): Record_ | null {
    const rec = this.data.get(key);
    if (!rec) return null;
    if (rec.expiresAt != null && rec.expiresAt <= Date.now()) {
      this.data.delete(key);
      return null;
    }
    return rec;
  }

  async hSet(key: string, fieldOrObj: string | Record<string, string>, value?: string): Promise<number> {
    let rec = this.live(key);
    if (!rec) {
      rec = { fields: new Map(), expiresAt: null };
      this.data.set(key, rec);
    }
    if (typeof fieldOrObj === 'object') {
      for (const [f, v] of Object.entries(fieldOrObj)) rec.fields.set(f, String(v));
    } else {
      rec.fields.set(fieldOrObj, String(value));
    }
    return 1;
  }

  async hGet(key: string, field: string): Promise<string | undefined> {
    return this.live(key)?.fields.get(field);
  }

  async hmGet(key: string, fields: string[]): Promise<(string | null)[]> {
    const rec = this.live(key);
    return fields.map((f) => rec?.fields.get(f) ?? null);
  }

  async pExpire(key: string, ms: number): Promise<number> {
    const rec = this.live(key);
    if (!rec) return 0;
    rec.expiresAt = Date.now() + ms;
    return 1;
  }

  async pTTL(key: string): Promise<number> {
    const rec = this.live(key);
    if (!rec) return -2;
    if (rec.expiresAt == null) return -1;
    return Math.max(0, rec.expiresAt - Date.now());
  }

  async del(key: string): Promise<number> {
    return this.data.delete(key) ? 1 : 0;
  }
}

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const HTML = `<!DOCTYPE html><html><head>
<meta property="og:title" content="Тест" />
<meta property="og:image" content="http://localhost:5173/pic.png" />
</head><body>ok</body></html>`;

interface SessionResponse {
  id: string;
  publicUrl: string;
  ownerToken: string;
  expiresAt: number;
  remainingMs: number;
}

async function startServer(): Promise<{ server: Server; base: string }> {
  const app = createApp(new FakeRedis());
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  if (addr == null || typeof addr === 'string') throw new Error('no port');
  return { server, base: `http://127.0.0.1:${addr.port}` };
}

async function createSession(base: string, overrides: Record<string, unknown> = {}): Promise<Response> {
  return fetch(`${base}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html: HTML,
      pageUrl: 'http://localhost:5173/',
      title: 'Тест',
      images: [{ url: 'http://localhost:5173/pic.png', contentType: 'image/png', dataB64: PNG_B64 }],
      ttlMinutes: 15,
      ...overrides
    })
  });
}

test('создание сессии: ссылка, таймер, переписанный HTML, картинка', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const resp = await createSession(base);
  assert.equal(resp.status, 201);
  const session = (await resp.json()) as SessionResponse;
  assert.ok(session.id && session.publicUrl && session.ownerToken);
  assert.ok(session.remainingMs > 14 * 60_000 && session.remainingMs <= 15 * 60_000);

  // Публичная страница отдаётся, URL картинки переписан
  const page = await fetch(session.publicUrl);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type') ?? '', /text\/html/);
  assert.ok(page.headers.get('content-security-policy'));
  const html = await page.text();
  assert.ok(!html.includes('http://localhost:5173/pic.png'));
  assert.ok(html.includes(`/s/${session.id}/img/0`));

  // Картинка раздаётся с верным типом
  const img = await fetch(`${base}/s/${session.id}/img/0`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');

  // Статус
  const status = (await (await fetch(`${base}/api/sessions/${session.id}`)).json()) as {
    running: boolean;
    remainingMs: number;
  };
  assert.equal(status.running, true);
  assert.ok(status.remainingMs > 0);
});

test('продление и остановка требуют токен владельца', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  const session = (await (await createSession(base)).json()) as SessionResponse;

  // Без токена — 403
  assert.equal((await fetch(`${base}/api/sessions/${session.id}/extend`, { method: 'POST' })).status, 403);
  assert.equal((await fetch(`${base}/api/sessions/${session.id}`, { method: 'DELETE' })).status, 403);

  // Продление с токеном
  const ext = await fetch(`${base}/api/sessions/${session.id}/extend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Owner-Token': session.ownerToken },
    body: JSON.stringify({ minutes: 15 })
  });
  assert.equal(ext.status, 200);
  const extended = (await ext.json()) as { remainingMs: number };
  assert.ok(extended.remainingMs > session.remainingMs, 'время должно увеличиться');

  // Остановка с токеном
  const del = await fetch(`${base}/api/sessions/${session.id}`, {
    method: 'DELETE',
    headers: { 'X-Owner-Token': session.ownerToken }
  });
  assert.equal(del.status, 200);

  // Сессии больше нет
  assert.equal((await fetch(`${base}/api/sessions/${session.id}`)).status, 404);
  assert.equal((await fetch(session.publicUrl)).status, 404);
});

test('лимиты: пустой html и слишком много картинок отклоняются', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  assert.equal((await createSession(base, { html: '' })).status, 400);

  const many = Array.from({ length: 11 }, (_, i) => ({
    url: `http://localhost/p${i}.png`,
    contentType: 'image/png',
    dataB64: PNG_B64
  }));
  assert.equal((await createSession(base, { images: many })).status, 413);

  const badType = [{ url: 'http://localhost/x', contentType: 'text/html', dataB64: PNG_B64 }];
  assert.equal((await createSession(base, { images: badType })).status, 400);
});

test('несуществующая сессия -> 404', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  assert.equal((await fetch(`${base}/api/sessions/nope`)).status, 404);
  assert.equal((await fetch(`${base}/s/nope`)).status, 404);
});

test('поисковики скрыты, но соц-краулеры видят превью', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const session = (await (await createSession(base)).json()) as SessionResponse;

  // Обычный запрос (не соц-краулер) — noindex стоит
  const page = await fetch(session.publicUrl);
  assert.match(page.headers.get('x-robots-tag') ?? '', /noindex/);
  await page.text();

  // Соц-краулер (Telegram) на /s/* — noindex НЕ ставим, иначе не будет превью
  const preview = await fetch(session.publicUrl, {
    headers: { 'user-agent': 'TelegramBot (like TwitterBot)' }
  });
  assert.equal(preview.headers.get('x-robots-tag'), null);
  await preview.text();

  // robots.txt: /s/ разрешён, остальное закрыто
  const robotsBody = await (await fetch(`${base}/robots.txt`)).text();
  assert.match(robotsBody, /Allow:\s*\/s\//);
  assert.match(robotsBody, /Disallow:\s*\//);
});
