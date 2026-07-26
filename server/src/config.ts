export const config = {
  port: Number(process.env.PORT) || 3000,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  // Базовый URL для публичных ссылок; если не задан — берётся из запроса.
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  defaultTtlMinutes: Number(process.env.DEFAULT_TTL_MINUTES) || 15,
  maxTtlMinutes: Number(process.env.MAX_TTL_MINUTES) || 120,
  // Лимиты
  maxHtmlBytes: Number(process.env.MAX_HTML_BYTES) || 10 * 1024 * 1024, // 10 МБ (env: MAX_HTML_BYTES)
  maxImageBytes: Number(process.env.MAX_IMAGE_BYTES) || 5 * 1024 * 1024, // 5 МБ на картинку
  maxImages: Number(process.env.MAX_IMAGES) || 10,
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || '40mb',
  createRatePerMinute: Number(process.env.CREATE_RATE_PER_MINUTE) || 10,
  apiRatePerMinute: Number(process.env.API_RATE_PER_MINUTE) || 120
};
