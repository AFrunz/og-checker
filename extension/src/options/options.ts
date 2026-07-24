/* Страница настроек. */
import { PROFILES } from '../lib/profiles';
import { parseDomainList } from '../lib/scope';
import { loadSettings, saveSettings } from '../lib/settings';
import type { ImageMode, ScopeMode } from '../lib/types';

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
  // 'single' больше не поддерживается в UI — трактуем его как чёрный список.
  setRadio('scopeMode', s.scopeMode === 'whitelist' ? 'whitelist' : 'blacklist');
  $<HTMLTextAreaElement>('whitelist').value = s.whitelist.join('\n');
  $<HTMLTextAreaElement>('blacklist').value = s.blacklist.join('\n');
  $<HTMLInputElement>('serverUrl').value = s.serverUrl;
  setRadio('imageMode', s.imageMode);
}

async function save(): Promise<void> {
  const prev = await loadSettings();
  await saveSettings({
    ...prev,
    enabled: $<HTMLInputElement>('enabled').checked,
    networks: [...document.querySelectorAll<HTMLInputElement>('#networks input:checked')].map((el) => el.value),
    scopeMode: radio('scopeMode') as ScopeMode,
    whitelist: parseDomainList($<HTMLTextAreaElement>('whitelist').value),
    blacklist: parseDomainList($<HTMLTextAreaElement>('blacklist').value),
    imageMode: radio('imageMode') as ImageMode,
    serverUrl: $<HTMLInputElement>('serverUrl').value.trim().replace(/\/+$/, '')
  });
  $('savedNote').hidden = false;
  setTimeout(() => ($('savedNote').hidden = true), 1500);
}

$('saveBtn').addEventListener('click', () => void save());
void load();
