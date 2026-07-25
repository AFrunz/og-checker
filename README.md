# OG Checker

*На русском — [README.ru.md](README.ru.md).*

An OpenGraph markup checker for local/staging environments (TypeScript):

- **Browser extension** (Chrome, Firefox, MV3) — local validation of OG tags against per‑social‑network profiles, with a status badge on the toolbar icon.
- **Server** (Express + Redis) — publishes a captured page at a temporary public URL so social crawlers can see it.

Detailed spec (RU) — [TZ.md](TZ.md).

## Structure

```
extension/   extension: TypeScript, MV3, esbuild → dist/
server/      Express server (TypeScript) + Redis; a single cjs bundle in Docker
```

## Quick start

```bash
npm install          # deps for both workspaces
npm run build        # esbuild: extension/dist/* and server/dist/index.cjs
npm run typecheck    # tsc --noEmit in both workspaces
npm test             # node:test via tsx (unit + integration)
```

### Server

```bash
docker compose up --build            # Express on :3000 + Redis  (npm run compose:up)
# or locally (needs a running Redis):
npm run dev --workspace server       # tsx watch
```

**Podman** (instead of Docker) — same config, nothing to change:

```bash
podman compose up --build            # npm run podman:up
# if no compose provider is present:  podman-compose up --build
```

Runs rootless: services talk to each other by name (`redis://redis:6379`), port `3000` is published to the host, and the image runs as a non‑privileged user (`USER node`). Stop with `npm run podman:down` (or `podman:down` / `compose:down`).

Environment variables — see [server/src/config.ts](server/src/config.ts) (`PORT`, `REDIS_URL`, `PUBLIC_BASE_URL`, limits, TTL).

### Extension

Build first: `npm run build --workspace extension` (for development — `npm run watch --workspace extension`).

**Chrome:** `chrome://extensions` → “Developer mode” → “Load unpacked” → the `extension/` folder.

**Firefox:** `about:debugging#/runtime/this-firefox` → “Load Temporary Add-on” → `extension/manifest.json`. In Firefox, host permissions are granted manually: allow site access in the add-on settings.

## How it works

### Local check

The content script collects `og:*` / `twitter:*` / `fb:*` tags and passes them to the background, which validates them against the social‑network profiles in [extension/src/lib/profiles.ts](extension/src/lib/profiles.ts) (required tags → `error`, recommended → `warning`; `og:image` reachability and dimensions are checked via fetch). The result is shown as a toolbar badge:

| Color | Meaning |
|---|---|
| grey | disabled / out of scope |
| blue | checking |
| green | all good |
| yellow | warnings |
| red | errors |

Scope: **all sites except a blacklist** (default) / **only sites in a whitelist**. Pattern — `host[:port]`, `*` is a wildcard (`*.example.com`, `localhost:3000`). The popup also has a per‑site toggle (“enable/disable on this site”).

### Server check

From a button in the popup, the extension captures the rendered HTML (after JS), optionally uploads images (all / only externally‑unreachable / none), and sends it to the server. The server stores everything in Redis with a 15‑minute TTL, rewrites image URLs to public ones, and returns a `/s/{id}` link. The popup shows the link and a countdown; the session can be extended or stopped — by the owner only (token/cookie).

API: `POST /api/sessions`, `GET /api/sessions/:id`, `POST /api/sessions/:id/extend`, `DELETE /api/sessions/:id`; public: `GET /s/:id`, `GET /s/:id/img/:n`.

Security: the captured page is served with a strict CSP (scripts don’t execute), plus rate limiting and size limits (in config). For public deployment, serve the static content from a separate subdomain via a reverse proxy (see Stage 7 in TZ.md).

## Status

MVP: stages 0–6 from TZ.md implemented in TypeScript. The UI is themed (Soft dark — popup with Check/Server tabs and a per‑network accordion, options page, extension icons). Open: manual QA in Chrome/Firefox, public deployment (Stage 7).

## License

MIT — see [LICENSE](LICENSE).
