# OG Checker

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
docker compose up --build            # Express на :3000 + Redis
# или локально (нужен запущенный Redis):
npm run dev --workspace server       # tsx watch
```

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

Область проверки: только указанный домен / все кроме чёрного списка / только белый список. Шаблон — `host[:port]`, `*` — wildcard (`*.example.com`, `localhost:3000`).

### Серверная проверка

По кнопке в popup расширение снимает отрендеренный HTML (после JS), при необходимости выгружает картинки (все / только недоступные извне / никакие), и отправляет на сервер. Сервер сохраняет всё в Redis с TTL 15 минут, переписывает URL картинок на публичные и возвращает ссылку `/s/{id}`. В popup показывается ссылка и таймер; сессию можно продлить или остановить — только владельцу (токен/кука).

API: `POST /api/sessions`, `GET /api/sessions/:id`, `POST /api/sessions/:id/extend`, `DELETE /api/sessions/:id`, публично: `GET /s/:id`, `GET /s/:id/img/:n`.

Безопасность: снятая страница отдаётся с жёстким CSP (скрипты не исполняются), rate limiting и лимиты на размер — в конфиге. На публичном деплое статику стоит вынести на отдельный поддомен через reverse proxy (см. Этап 7 в TZ.md).

## Статус

MVP: этапы 0–6 из TZ.md реализованы на TypeScript (UI расширения — минимальный, без дизайна; иконки не отрисованы). Не закрыто: ручная проверка в Chrome/Firefox, публичный деплой (Этап 7).
