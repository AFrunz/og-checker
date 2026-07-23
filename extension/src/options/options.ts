/* Страница настроек. */
import browser from 'webextension-polyfill';
import { PROFILES } from '../lib/profiles';
import { parseDomainList } from '../lib/scope';
import { loadSettings, saveSettings } from '../lib/settings';
import type { ImageMode, ScopeMode, Settings } from '../lib/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

function radio(name: string): string {
  return (document.querySelector(`input[name="${name}"]:checked`) as HTMLInputElement).value;
}

function setRadio(name: string, value: string): void {
  const el = document.querySelector(`input[name="${name}"][value="${value}"]`) as HTMLInputElement | null;
  if (el) el.checked = true;
}

function renderNetworks(selected: string[]): void {
  const box = $('networks');
  box.textContent = '';
  for (const profile of PROFILES) {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = profile.id;
    cb.checked = selected.includes(profile.id);
    const span = document.createElement('span');
    span.textContent = profile.name;
    label.append(cb, span);
    box.append(label);
  }
}

async function load(): Promise<void> {
  const s = await loadSettings();
  $<HTMLInputElement>('enabled').checked = s.enabled;
  renderNetworks(s.networks);
  setRadio('scopeMode', s.scopeMode);
  $<HTMLInputElement>('singleDomain').value = s.singleDomain;
  $<HTMLTextAreaElement>('whitelist').value = s.whitelist.join('\n');
  $<HTMLTextAreaElement>('blacklist').value = s.blacklist.join('\n');
  $<HTMLInputElement>('serverUrl').value = s.serverUrl;
  $<HTMLInputElement>('serverTtl').value = String(s.serverTtlMinutes);
  setRadio('imageMode', s.imageMode);
}

async function save(): Promise<void> {
  const settings: Settings = {
    enabled: $<HTMLInputElement>('enabled').checked,
    networks: [...document.querySelectorAll<HTMLInputElement>('#networks input:checked')].map((el) => el.value),
    scopeMode: radio('scopeMode') as ScopeMode,
    singleDomain: $<HTMLInputElement>('singleDomain').value.trim().toLowerCase(),
    whitelist: parseDomainList($<HTMLTextAreaElement>('whitelist').value),
    blacklist: parseDomainList($<HTMLTextAreaElement>('blacklist').value),
    imageMode: radio('imageMode') as ImageMode,
    serverUrl: $<HTMLInputElement>('serverUrl').value.trim().replace(/\/+$/, ''),
    serverTtlMinutes: Math.min(120, Math.max(1, Number($<HTMLInputElement>('serverTtl').value) || 15))
  };
  await saveSettings(settings);
  $('savedNote').hidden = false;
  setTimeout(() => ($('savedNote').hidden = true), 1500);
}

$('useCurrentBtn').addEventListener('click', async () => {
  // Настройки открыты в своей вкладке, поэтому ищем активную http(s)-вкладку
  // по всем окнам (первую, которая не является страницей расширения).
  const tabs = await browser.tabs.query({ active: true });
  const tab = tabs.find((t) => t.url && /^https?:/.test(t.url));
  if (!tab?.url) return;
  const url = new URL(tab.url);
  $<HTMLInputElement>('singleDomain').value = url.port ? `${url.hostname}:${url.port}` : url.hostname;
  setRadio('scopeMode', 'single');
});

$('saveBtn').addEventListener('click', () => void save());
void load();
