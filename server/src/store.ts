/**
 * Хранилище сессий в Redis.
 * Одна сессия — один hash `sess:{id}` с TTL; поля:
 *   html      — снятая страница (после переписывания ссылок)
 *   meta      — JSON SessionMeta
 *   img:{n}   — base64 тела картинок
 */
import { createHash, randomBytes } from 'node:crypto';

/** Минимальный интерфейс Redis-клиента (ему соответствует и заглушка в тестах). */
export interface RedisLike {
  hSet(key: string, fields: Record<string, string>): Promise<unknown>;
  hSet(key: string, field: string, value: string): Promise<unknown>;
  hGet(key: string, field: string): Promise<string | null | undefined>;
  hmGet(key: string, fields: string[]): Promise<(string | null)[]>;
  pExpire(key: string, ms: number): Promise<unknown>;
  pTTL(key: string): Promise<number>;
  del(key: string): Promise<number>;
}

export interface SessionMeta {
  pageUrl: string;
  title: string;
  createdAt: number;
  ownerHash: string;
  imageTypes: string[];
}

export interface StoredImage {
  contentType: string;
  body: Buffer;
}

const key = (id: string): string => `sess:${id}`;

export function newId(): string {
  return randomBytes(8).toString('base64url');
}

export function newOwnerToken(): string {
  return randomBytes(24).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(String(token)).digest('hex');
}

export class SessionStore {
  constructor(private redis: RedisLike) {}

  async create(params: { html: string; meta: SessionMeta; images: { dataB64: string }[]; ttlMs: number }): Promise<string> {
    const id = newId();
    const fields: Record<string, string> = { html: params.html, meta: JSON.stringify(params.meta) };
    params.images.forEach((img, i) => {
      fields[`img:${i}`] = img.dataB64;
    });
    await this.redis.hSet(key(id), fields);
    await this.redis.pExpire(key(id), params.ttlMs);
    return id;
  }

  async setHtml(id: string, html: string): Promise<void> {
    await this.redis.hSet(key(id), 'html', html);
  }

  async getMeta(id: string): Promise<SessionMeta | null> {
    const raw = await this.redis.hGet(key(id), 'meta');
    return raw ? (JSON.parse(raw) as SessionMeta) : null;
  }

  async getHtml(id: string): Promise<string | null> {
    return (await this.redis.hGet(key(id), 'html')) ?? null;
  }

  async getImage(id: string, index: number): Promise<StoredImage | null> {
    const [metaRaw, dataB64] = await this.redis.hmGet(key(id), ['meta', `img:${index}`]);
    if (!metaRaw || !dataB64) return null;
    const meta = JSON.parse(metaRaw) as SessionMeta;
    const contentType = meta.imageTypes[index];
    if (!contentType) return null;
    return { contentType, body: Buffer.from(dataB64, 'base64') };
  }

  /** Оставшееся время жизни, мс; null — сессии нет. */
  async remainingMs(id: string): Promise<number | null> {
    const pttl = await this.redis.pTTL(key(id));
    return pttl > 0 ? pttl : null;
  }

  /** Продлевает сессию на addMs, но не больше maxMs суммарно. */
  async extend(id: string, addMs: number, maxMs: number): Promise<number | null> {
    const current = await this.remainingMs(id);
    if (current == null) return null;
    const next = Math.min(current + addMs, maxMs);
    await this.redis.pExpire(key(id), next);
    return next;
  }

  /** Продлевает TTL без изменения длительности (после дозаписи полей). */
  async touch(id: string, ttlMs: number): Promise<void> {
    await this.redis.pExpire(key(id), ttlMs);
  }

  async destroy(id: string): Promise<boolean> {
    return (await this.redis.del(key(id))) > 0;
  }
}
