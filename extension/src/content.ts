/**
 * Content script: собирает OG-теги со страницы и отдаёт их в background.
 *
 * Два набора тегов:
 *  - «живой» — из DOM после исполнения JS;
 *  - «статический» — из исходного HTML страницы (fetch своего же URL +
 *    DOMParser, JS не исполняется) — ровно то, что видит соц-краулер.
 */
import browser from 'webextension-polyfill';
import { collectMetaTags } from './lib/parser';
import type { MetaTag, PageSnapshot } from './lib/types';

let staticTagsPromise: Promise<MetaTag[] | null> | undefined;

/** Теги из исходного HTML (без JS); null — исходник получить не удалось. */
function getStaticTags(): Promise<MetaTag[] | null> {
  staticTagsPromise ??= (async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const resp = await fetch(location.href, {
        credentials: 'include',
        cache: 'no-cache',
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (!resp.ok) return null;
      const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
      return collectMetaTags(doc);
    } catch {
      return null; // страница — результат POST, сеть, таймаут и т.п.
    }
  })();
  return staticTagsPromise;
}

async function sendTags(): Promise<void> {
  const staticTags = await getStaticTags();
  browser.runtime
    .sendMessage({ type: 'ogc:tags', url: location.href, tags: collectMetaTags(document), staticTags })
    .catch(() => {}); // background может быть ещё не готов
}

browser.runtime.onMessage.addListener((msg: unknown): Promise<PageSnapshot> | undefined => {
  const m = msg as { type?: string };
  if (m?.type === 'ogc:collect') {
    void sendTags();
    return undefined;
  }
  if (m?.type === 'ogc:getSnapshot') {
    return getStaticTags().then((staticTags) => ({
      url: location.href,
      title: document.title,
      tags: collectMetaTags(document),
      staticTags
    }));
  }
  return undefined;
});

void sendTags();
