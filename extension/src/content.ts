/**
 * Content script: собирает OG-теги со страницы и отдаёт их в background.
 * Также по запросу отдаёт отрендеренный HTML (для серверного режима).
 */
import browser from 'webextension-polyfill';
import { collectMetaTags } from './lib/parser';
import type { PageSnapshot } from './lib/types';

function sendTags(): void {
  browser.runtime
    .sendMessage({ type: 'ogc:tags', url: location.href, tags: collectMetaTags(document) })
    .catch(() => {}); // background может быть ещё не готов
}

browser.runtime.onMessage.addListener((msg: unknown): Promise<PageSnapshot> | undefined => {
  const m = msg as { type?: string };
  if (m?.type === 'ogc:collect') {
    sendTags();
    return undefined;
  }
  if (m?.type === 'ogc:getHtml') {
    // Отрендеренный DOM после исполнения JS + текущие мета-теги
    return Promise.resolve({
      html: '<!DOCTYPE html>\n' + document.documentElement.outerHTML,
      url: location.href,
      title: document.title,
      tags: collectMetaTags(document)
    });
  }
  return undefined;
});

sendTags();
