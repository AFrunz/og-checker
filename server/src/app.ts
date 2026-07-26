/**
 * Express-приложение OG Checker.
 *  - /api/sessions          — создание/статус/продление/остановка сессий
 *  - /s/:id, /s/:id/img/:n  — публичная раздача снятой страницы и картинок
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { hashToken, newOwnerToken, SessionStore, type RedisLike, type SessionMeta } from './store';
import { rewriteImageUrls } from './rewrite';

const MINUTE = 60_000;

interface UploadImage {
  url: string;
  contentType: string;
  dataB64: string;
}

interface CreateBody {
  html?: unknown;
  pageUrl?: unknown;
  title?: unknown;
  images?: unknown;
  ttlMinutes?: unknown;
}

export function createApp(redis: RedisLike): express.Express {
  const store = new SessionStore(redis);
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // за reverse proxy на этапе деплоя
  app.use(helmet({ contentSecurityPolicy: false })); // CSP свой на /s/*
  // Ничего на этом сервере не должно попадать в поисковики: ни API, ни
  // эфемерные снятые страницы, ни их картинки. X-Robots-Tag на все ответы.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.set('X-Robots-Tag', 'noindex, nofollow, noarchive, noimageindex');
    next();
  });
  app.use(cookieParser());
  app.use(express.json({ limit: config.jsonBodyLimit }));

  const apiLimiter = rateLimit({
    windowMs: MINUTE,
    limit: config.apiRatePerMinute,
    standardHeaders: true,
    legacyHeaders: false
  });
  const createLimiter = rateLimit({
    windowMs: MINUTE,
    limit: config.createRatePerMinute,
    standardHeaders: true,
    legacyHeaders: false
  });

  // CORS: расширения ходят с origin chrome-extension://... / moz-extension://...
  app.use(
    '/api',
    cors({
      origin: true,
      credentials: true,
      allowedHeaders: ['Content-Type', 'X-Owner-Token'],
      methods: ['GET', 'POST', 'DELETE']
    }),
    apiLimiter
  );

  const publicBase = (req: Request): string => config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
  const ownerCookieName = (id: string): string => `ogc_owner_${id}`;

  /** Проверка владельца: заголовок X-Owner-Token или кука. */
  async function requireOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { id } = req.params;
    const meta = await store.getMeta(id);
    if (!meta) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    const token = req.get('X-Owner-Token') || (req.cookies as Record<string, string>)[ownerCookieName(id)];
    if (!token || hashToken(token) !== meta.ownerHash) {
      res.status(403).json({ error: 'owner token required' });
      return;
    }
    next();
  }

  // -------------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------------

  app.post('/api/sessions', createLimiter, async (req: Request, res: Response) => {
    const { html, pageUrl, title, images = [], ttlMinutes } = (req.body ?? {}) as CreateBody;

    if (typeof html !== 'string' || !html.trim()) {
      res.status(400).json({ error: 'html is required' });
      return;
    }
    if (Buffer.byteLength(html, 'utf8') > config.maxHtmlBytes) {
      res.status(413).json({ error: `html exceeds ${config.maxHtmlBytes} bytes` });
      return;
    }
    if (!Array.isArray(images) || images.length > config.maxImages) {
      res.status(413).json({ error: `too many images (max ${config.maxImages})` });
      return;
    }
    for (const img of images as UploadImage[]) {
      if (!img || typeof img.url !== 'string' || typeof img.dataB64 !== 'string' || !/^image\//.test(img.contentType ?? '')) {
        res.status(400).json({ error: 'invalid image entry' });
        return;
      }
      if (Buffer.byteLength(img.dataB64, 'utf8') * 0.75 > config.maxImageBytes) {
        res.status(413).json({ error: `image exceeds ${config.maxImageBytes} bytes` });
        return;
      }
    }
    const imgs = images as UploadImage[];

    const ttlMin = Math.min(Math.max(Number(ttlMinutes) || config.defaultTtlMinutes, 1), config.maxTtlMinutes);
    const ttlMs = ttlMin * MINUTE;

    const ownerToken = newOwnerToken();
    const meta: SessionMeta = {
      pageUrl: typeof pageUrl === 'string' ? pageUrl.slice(0, 2000) : '',
      title: typeof title === 'string' ? title.slice(0, 500) : '',
      createdAt: Date.now(),
      ownerHash: hashToken(ownerToken),
      imageTypes: imgs.map((i) => i.contentType)
    };

    // Сначала создаём сессию, чтобы знать id для публичных URL картинок,
    // затем переписываем HTML и кладём финальную версию.
    const id = await store.create({ html: '', meta, images: imgs, ttlMs });
    const base = publicBase(req);
    const urlMap = new Map(imgs.map((img, i) => [img.url, `${base}/s/${id}/img/${i}`]));
    await store.setHtml(id, rewriteImageUrls(html, urlMap));
    await store.touch(id, ttlMs); // hSet не сбрасывает TTL, но фиксируем явно

    res.cookie(ownerCookieName(id), ownerToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: config.maxTtlMinutes * MINUTE,
      path: `/api/sessions/${id}`
    });
    res.status(201).json({
      id,
      publicUrl: `${base}/s/${id}`,
      ownerToken,
      expiresAt: Date.now() + ttlMs,
      remainingMs: ttlMs
    });
  });

  app.get('/api/sessions/:id', async (req: Request, res: Response) => {
    const remainingMs = await store.remainingMs(req.params.id);
    if (remainingMs == null) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    res.json({
      id: req.params.id,
      running: true,
      remainingMs,
      expiresAt: Date.now() + remainingMs,
      publicUrl: `${publicBase(req)}/s/${req.params.id}`
    });
  });

  app.post('/api/sessions/:id/extend', requireOwner, async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { minutes?: unknown };
    const addMin = Math.min(Math.max(Number(body.minutes) || config.defaultTtlMinutes, 1), config.maxTtlMinutes);
    const remainingMs = await store.extend(req.params.id, addMin * MINUTE, config.maxTtlMinutes * MINUTE);
    if (remainingMs == null) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    res.json({ id: req.params.id, remainingMs, expiresAt: Date.now() + remainingMs });
  });

  app.delete('/api/sessions/:id', requireOwner, async (req: Request, res: Response) => {
    await store.destroy(req.params.id);
    res.clearCookie(ownerCookieName(req.params.id), { path: `/api/sessions/${req.params.id}` });
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Публичная статика (то, что увидит краулер)
  // -------------------------------------------------------------------------

  // Жёсткий CSP: скрипты в снятой странице не исполняются — краулерам они
  // не нужны, а нам не нужен чужой JS на нашем origin.
  const STATIC_CSP = "default-src 'none'; img-src * data:; style-src * 'unsafe-inline'; font-src *;";

  app.get('/s/:id', async (req: Request, res: Response) => {
    const html = await store.getHtml(req.params.id);
    if (!html) {
      res.status(404).type('text/plain').send('Сессия не найдена или истекла');
      return;
    }
    res
      .set('Content-Security-Policy', STATIC_CSP)
      .set('Cache-Control', 'no-store')
      .type('text/html; charset=utf-8')
      .send(html);
  });

  app.get('/s/:id/img/:n(\\d+)', async (req: Request, res: Response) => {
    const img = await store.getImage(req.params.id, Number(req.params.n));
    if (!img) {
      res.status(404).end();
      return;
    }
    res.set('Cache-Control', 'no-store').type(img.contentType).send(img.body);
  });

  // Запрещаем обход всего домена. Соц-краулеры (FB/LinkedIn/Telegram) при фетче
  // расшаренной ссылки robots.txt игнорируют, а обычные поисковики — уважают.
  app.get('/robots.txt', (_req: Request, res: Response) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /\n');
  });

  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  return app;
}
