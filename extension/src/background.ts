/**
 * Background (MV3): оркестрация локальной проверки, badge, серверный режим.
 * Собирается esbuild в один бандл — работает и как service worker (Chrome),
 * и как background-скрипт (Firefox).
 */
import browser, { type Runtime } from 'webextension-polyfill';
import { getT } from './lib/i18n';
import { PROFILES } from './lib/profiles';
import { getTagAll } from './lib/parser';
import { shouldCheckUrl } from './lib/scope';
import { collectImageUrls, validate } from './lib/validator';
import { loadSettings } from './lib/settings';
import { isPrivateUrl, resolveUrl } from './lib/urlutils';
import type {
  ImageInfo,
  ImageInfoMap,
  MetaTag,
  PageSnapshot,
  ServerSession,
  TabResult,
  TagSource,
  UploadImage
} from './lib/types';

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

type BadgeState = 'disabled' | 'skipped' | 'busy' | 'ok' | 'warning' | 'error';

const BADGE: Record<BadgeState, { text: string; color: string }> = {
  disabled: { text: '–', color: '#9e9e9e' },
  skipped: { text: '', color: '#9e9e9e' },
  busy: { text: '…', color: '#2196f3' },
  ok: { text: '✓', color: '#43a047' },
  warning: { text: '!', color: '#f9a825' },
  error: { text: '✗', color: '#e53935' }
};

async function setBadge(tabId: number, state: BadgeState): Promise<void> {
  const { text, color } = BADGE[state];
  try {
    await browser.action.setBadgeText({ tabId, text });
    if (text) {
      await browser.action.setBadgeBackgroundColor({ tabId, color });
      await browser.action.setBadgeTextColor?.({ tabId, color: '#ffffff' });
    }
  } catch {
    // вкладка могла закрыться
  }
}

// ---------------------------------------------------------------------------
// Результаты по вкладкам (storage.session переживает рестарт SW)
// ---------------------------------------------------------------------------

const resultStore = browser.storage.session ?? browser.storage.local;

async function saveResult(tabId: number, result: TabResult): Promise<void> {
  await resultStore.set({ ['result:' + tabId]: result });
}

async function getResult(tabId: number): Promise<TabResult | null> {
  const data = await resultStore.get('result:' + tabId);
  return (data['result:' + tabId] as TabResult) ?? null;
}

browser.tabs.onRemoved.addListener((tabId) => {
  resultStore.remove('result:' + tabId).catch(() => {});
});

// ---------------------------------------------------------------------------
// Проверка картинок (fetch из background — есть host_permissions)
// ---------------------------------------------------------------------------

async function probeImage(url: string): Promise<ImageInfo> {
  try {
    const resp = await fetch(url, { credentials: 'omit', cache: 'no-cache' });
    if (!resp.ok) return { reachable: false };
    const blob = await resp.blob();
    if (!blob.type.startsWith('image/')) return { reachable: false };
    const bytes = blob.size;
    try {
      const bmp = await createImageBitmap(blob);
      const info: ImageInfo = { reachable: true, width: bmp.width, height: bmp.height, bytes };
      bmp.close();
      return info;
    } catch {
      return { reachable: true, bytes }; // формат не декодируется (например, svg в FF)
    }
  } catch {
    return { reachable: false };
  }
}

async function probeImages(urls: string[], pageUrl: string): Promise<ImageInfoMap> {
  const info: ImageInfoMap = {};
  await Promise.all(
    urls.map(async (raw) => {
      const abs = resolveUrl(raw, pageUrl);
      info[raw] = abs ? await probeImage(abs) : { reachable: false };
    })
  );
  return info;
}

// ---------------------------------------------------------------------------
// Локальная проверка
// ---------------------------------------------------------------------------

async function runCheck(tabId: number, url: string, tags: MetaTag[], staticTags: MetaTag[] | null): Promise<void> {
  const settings = await loadSettings();

  if (!settings.enabled) {
    await setBadge(tabId, 'disabled');
    await saveResult(tabId, { status: 'disabled', url });
    return;
  }

  const scope = shouldCheckUrl(url, settings);
  if (!scope.check) {
    await setBadge(tabId, 'skipped');
    await saveResult(tabId, { status: 'skipped', reason: scope.reason, url });
    return;
  }

  await setBadge(tabId, 'busy');
  await saveResult(tabId, { status: 'busy', url });

  const profiles = PROFILES.filter((p) => settings.networks.includes(p.id));
  const imageUrls = collectImageUrls(profiles, tags);
  const imageInfo = await probeImages(imageUrls, url);
  const report = validate(profiles, tags, imageInfo, staticTags, settings.language);

  await setBadge(tabId, report.level);
  await saveResult(tabId, { status: 'done', url, tags, report, checkedAt: Date.now() });
}

/** Повторная проверка вкладки (после смены настроек / по кнопке). */
async function recheckTab(tabId: number): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, { type: 'ogc:collect' });
  } catch {
    // на вкладке нет content script (chrome://, магазин и т.п.)
    await setBadge(tabId, 'skipped');
  }
}

browser.storage.onChanged.addListener((changes) => {
  if (!changes.settings) return;
  browser.tabs.query({ active: true }).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id != null) void recheckTab(tab.id);
    }
  });
});

/**
 * Приводит badge вкладки в соответствие с текущими настройками.
 * Вызывается при переключении вкладок — иначе значок «застревает»
 * в состоянии, снятом при последней загрузке страницы.
 */
async function syncTab(tabId: number): Promise<void> {
  const settings = await loadSettings();
  if (!settings.enabled) {
    let url = '';
    try {
      url = (await browser.tabs.get(tabId)).url ?? '';
    } catch {
      // вкладка закрыта
    }
    await setBadge(tabId, 'disabled');
    await saveResult(tabId, { status: 'disabled', url });
    return;
  }
  const stored = await getResult(tabId);
  if (stored?.status === 'done') {
    await setBadge(tabId, stored.report?.level ?? 'ok');
    return;
  }
  if (stored?.status === 'skipped') {
    await setBadge(tabId, 'skipped');
    return;
  }
  if (stored?.status === 'busy') {
    await setBadge(tabId, 'busy');
    return;
  }
  // свежего результата нет (или он устарел после повторного включения) — перепроверяем
  await recheckTab(tabId);
}

browser.tabs.onActivated.addListener(({ tabId }) => {
  void syncTab(tabId);
});

// ---------------------------------------------------------------------------
// Серверный режим
// ---------------------------------------------------------------------------

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Собирает картинки для отправки согласно режиму настроек. */
async function collectImagesForUpload(tags: MetaTag[], pageUrl: string, imageMode: string): Promise<UploadImage[]> {
  if (imageMode === 'none') return [];

  const rawUrls = new Set<string>();
  for (const key of ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image']) {
    for (const v of getTagAll(tags, key)) {
      if (v) rawUrls.add(v);
    }
  }

  const images: UploadImage[] = [];
  for (const raw of rawUrls) {
    const abs = resolveUrl(raw, pageUrl);
    if (!abs) continue;
    if (imageMode === 'unavailable' && !isPrivateUrl(abs)) continue; // публичная — не трогаем
    try {
      const resp = await fetch(abs, { credentials: 'omit' });
      if (!resp.ok) continue;
      const blob = await resp.blob();
      if (!blob.type.startsWith('image/')) continue;
      images.push({ url: raw, contentType: blob.type, dataB64: await blobToBase64(blob) });
    } catch {
      // недоступна даже локально — пропускаем
    }
  }
  return images;
}

async function createServerSession(tabId: number): Promise<ServerSession> {
  const settings = await loadSettings();
  const t = getT(settings.language);
  const serverUrl = settings.serverUrl.replace(/\/+$/, '');
  if (!serverUrl) throw new Error(t('err.noServerUrl'));

  const page = (await browser.tabs.sendMessage(tabId, { type: 'ogc:getSnapshot' })) as PageSnapshot | undefined;
  if (!page) throw new Error(t('err.noPageData'));

  // Честная симуляция краулера: теги из статического HTML (без JS).
  // Если исходник получить не удалось — фолбэк на DOM после JS с пометкой.
  const source: TagSource = page.staticTags !== null ? 'static' : 'rendered';
  const tags = page.staticTags ?? page.tags;
  const images = await collectImagesForUpload(tags, page.url, settings.imageMode);

  const resp = await fetch(serverUrl + '/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      tags,
      source,
      lang: settings.language,
      pageUrl: page.url,
      title: page.title,
      images,
      ttlMinutes: settings.serverTtlMinutes
    })
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(t('err.serverResponded', { status: resp.status, text: text.slice(0, 200) }));
  }
  const session = (await resp.json()) as { id: string; publicUrl: string; expiresAt: number; ownerToken: string };

  const stored: ServerSession = {
    id: session.id,
    publicUrl: session.publicUrl,
    expiresAt: session.expiresAt,
    ownerToken: session.ownerToken,
    serverUrl,
    pageUrl: page.url,
    createdAt: Date.now(),
    source
  };
  await browser.storage.local.set({ serverSession: stored });
  return stored;
}

// ---------------------------------------------------------------------------
// Сообщения
// ---------------------------------------------------------------------------

interface Message {
  type: string;
  tabId?: number;
  url?: string;
  tags?: MetaTag[];
  staticTags?: MetaTag[] | null;
}

browser.runtime.onMessage.addListener((msg: unknown, sender: Runtime.MessageSender): Promise<unknown> | undefined => {
  const m = msg as Message;
  if (!m?.type) return undefined;

  switch (m.type) {
    case 'ogc:tags': {
      const tabId = sender.tab?.id;
      if (tabId != null && m.url && m.tags) void runCheck(tabId, m.url, m.tags, m.staticTags ?? null);
      return undefined;
    }
    case 'ogc:getState':
      return (async () => {
        const settings = await loadSettings();
        const result = m.tabId != null ? await getResult(m.tabId) : null;
        const { serverSession } = await browser.storage.local.get('serverSession');
        return { settings, result, serverSession: (serverSession as ServerSession) ?? null };
      })();
    case 'ogc:recheck':
      if (m.tabId != null) void recheckTab(m.tabId);
      return undefined;
    case 'ogc:createSession':
      if (m.tabId == null) return Promise.resolve({ ok: false, error: 'нет активной вкладки' });
      return createServerSession(m.tabId).then(
        (session) => ({ ok: true, session }),
        (err: Error) => ({ ok: false, error: err.message })
      );
    case 'ogc:clearSession':
      return browser.storage.local.remove('serverSession').then(() => ({ ok: true }));
    default:
      return undefined;
  }
});
