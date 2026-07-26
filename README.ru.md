# OG Checker

*English version — [README.md](README.md).*

Система проверки OpenGraph разметки для тестового/локального окружения (TypeScript):

- **Расширение браузера** (Chrome, Firefox, MV3) — локальная проверка OG-тегов по профилям соцсетей с индикацией на иконке.
- **Сервер** (Express + Redis) — публикует снятую страницу по временной публичной ссылке, чтобы её увидели краулеры соцсетей.

Подробное ТЗ — в [TZ.md](TZ.md).

## Скриншоты

| Локальная проверка | Вкладка «Сервер» |
|:---:|:---:|
| <img src="docs/images/popup-check.png" width="320" alt="Popup — вкладка Проверка" /> | <img src="docs/images/popup-server.png" width="320" alt="Popup — вкладка Сервер" /> |

## Структура

```
extension/   расширение: TypeScript, MV3, сборка esbuild в dist/
server/      Express-сервер (TypeScript) + Redis; в Docker собирается один cjs-бандл
```

## Быстрый старт

```bash
npm install          # зависимости обоих воркспейсов
npm run build        # esbuild: extension/dist/* и server/dist/index.cjs
npm run typecheck    # tsc --noEmit в обоих воркспейсах
npm test             # node:test через tsx (юнит + интеграционные)
```

### Сервер

```bash
docker compose up --build            # Express на :3000 + Redis  (npm run compose:up)
# или локально (нужен запущенный Redis):
npm run dev --workspace server       # tsx watch
```

**Podman** (вместо Docker) — та же конфигурация, менять ничего не нужно:

```bash
podman compose up --build            # npm run podman:up
# при отсутствии провайдера compose:  podman-compose up --build
```

Работает в rootless-режиме: сервисы общаются по имени (`redis://redis:6379`), порт `3000` пробрасывается на хост, образ запускается от непривилегированного пользователя (`USER node`). Остановить — `npm run podman:down` (или `podman:down` / `compose:down`).

Переменные окружения — см. [server/src/config.ts](server/src/config.ts) (`PORT`, `REDIS_URL`, `PUBLIC_BASE_URL`, лимиты, TTL).

### Расширение

Сначала сборка: `npm run build --workspace extension` (для разработки — `npm run watch --workspace extension`).

**Chrome:** `chrome://extensions` → «Режим разработчика» → «Загрузить распакованное» → папка `extension/`.

**Firefox:** `about:debugging#/runtime/this-firefox` → «Загрузить временное дополнение» → `extension/manifest.json`. В Firefox host-разрешения выдаются вручную: разрешите доступ к сайтам в настройках дополнения.

## Как это работает

### Локальная проверка

Content script собирает `og:*` / `twitter:*` / `fb:*` теги и передаёт в background, который валидирует их по профилям соцсетей из [extension/src/lib/profiles.ts](extension/src/lib/profiles.ts) (обязательные теги → `error`, рекомендуемые → `warning`, доступность и размеры `og:image` проверяются fetch-ем). Результат — badge на иконке:

| Цвет | Значение |
|---|---|
| серый | выключено / вне области проверки |
| синий | проверка идёт |
| зелёный | всё ок |
| жёлтый | есть замечания |
| красный | ошибки |

Область проверки: **все сайты кроме чёрного списка** (по умолчанию) / **только белый список**. Шаблон — `host[:port]`, `*` — wildcard (`*.example.com`, `localhost:3000`). В popup есть тумблер «включить/отключить на этом сайте».

### Серверная проверка

По кнопке в popup расширение снимает отрендеренный HTML (после JS), при необходимости выгружает картинки (все / только недоступные извне / никакие), и отправляет на сервер. Сервер сохраняет всё в Redis с TTL 15 минут, переписывает URL картинок на публичные и возвращает ссылку `/s/{id}`. В popup показывается ссылка и таймер; сессию можно продлить или остановить — только владельцу (токен/кука).

API: `POST /api/sessions`, `GET /api/sessions/:id`, `POST /api/sessions/:id/extend`, `DELETE /api/sessions/:id`, публично: `GET /s/:id`, `GET /s/:id/img/:n`.

Безопасность: снятая страница отдаётся с жёстким CSP (скрипты не исполняются), rate limiting и лимиты на размер — в конфиге. На публичном деплое статику стоит вынести на отдельный поддомен через reverse proxy (см. Этап 7 в TZ.md).

## Деплой (один домен, Caddy c авто-HTTPS)

На ВМ нужно: Docker (или Podman), домен с **A-записью → публичный IP ВМ**, открытые порты **80/443**.

1. Скопировать env и указать домен:
   ```bash
   cp .env.example .env   # затем DOMAIN=yourdomain.tld
   ```
2. Поднять стек (Caddy + сервер + Redis):
   ```bash
   npm run deploy:up      # docker compose -f docker-compose.prod.yml up -d --build
   # Podman:  DOMAIN=yourdomain.tld podman compose -f docker-compose.prod.yml up -d --build
   ```

[Caddy](Caddyfile) сам выпустит сертификат Let's Encrypt для `$DOMAIN` (сертификаты хранятся в volume `caddy_data`). Сервер не публикует порт на хост — доступен только через Caddy, а `PUBLIC_BASE_URL=https://$DOMAIN`, поэтому ссылки `/s/{id}` и картинки идут на него. Всё на одном origin: API — `/api/*`, публичные страницы — `/s/*`.

В настройках расширения укажи адрес сервера `https://$DOMAIN`. Остановить — `npm run deploy:down`.

Для более строгой изоляции позже можно разнести API и раздачу страниц на два поддомена (`api.` / `s.`): задать `PUBLIC_BASE_URL` на `s.`-хост, а расширение направить на `api.`-хост (Этап 7 в TZ.md). Правок кода не нужно — расширение авторизуется заголовком `X-Owner-Token`.

### Статистика использования (без БД)

Простой счётчик созданных сессий по дням пишется в JSON-файл (`STATS_FILE=/data/stats.json`, на томе `server_data`) — без базы данных. Смотреть день/неделю/месяц/всего через эндпоинт под токеном:

```bash
# сначала задай ADMIN_TOKEN в .env, затем:
curl "https://$DOMAIN/admin/stats?token=$ADMIN_TOKEN"
# → {"sessions":{"day":3,"week":12,"month":40,"total":57}}
```

Без `ADMIN_TOKEN` эндпоинт выключен (404), но статистика всё равно копится. day/week/month — скользящие окна (последние 1/7/30 UTC-суток). Можно и просто прочитать файл: `docker compose -f docker-compose.prod.yml exec server cat /data/stats.json`.

## Статус

Этапы 0–7 из TZ.md реализованы на TypeScript. UI оформлен (тема Soft dark — popup с вкладками **«Проверка» / «Сервер»** и аккордеоном по соцсетям, страница настроек, иконки расширения). Сервер работает в проде за Caddy с авто-HTTPS на одном домене (Docker / Podman), есть файловая статистика и скрытие от поисковиков (`noindex` + `robots.txt`). Опционально / далее: изоляция раздаваемых страниц на поддомене (Этап 7), более широкая ручная проверка в Chrome/Firefox.

## Лицензия

MIT — см. [LICENSE](LICENSE).
