# OG Checker

*English version — [README.md](README.md).*

Система проверки OpenGraph разметки для тестового/локального окружения (TypeScript):

- **Расширение браузера** (Chrome, Firefox, MV3) — локальная проверка OG-тегов по профилям соцсетей с индикацией на иконке.
- **Сервер** (Express + Redis) — публикует снятую страницу по временной публичной ссылке, чтобы её увидели краулеры соцсетей.

Подробное ТЗ — в [TZ.md](TZ.md).

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

## Статус

MVP: этапы 0–6 из TZ.md реализованы на TypeScript. UI оформлен (тема Soft dark — popup с вкладками «Проверка»/«Сервер» и аккордеоном по соцсетям, страница настроек, иконки расширения). Не закрыто: ручная проверка в Chrome/Firefox, публичный деплой (Этап 7).

## Лицензия

MIT — см. [LICENSE](LICENSE).
