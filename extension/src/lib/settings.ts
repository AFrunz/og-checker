/**
 * Настройки расширения: значения по умолчанию и доступ к storage.
 * Хранение — browser.storage.sync с фолбэком на storage.local.
 */
import browser from 'webextension-polyfill';
import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  networks: ['facebook', 'vk', 'telegram', 'twitter', 'linkedin'],
  scopeMode: 'blacklist',
  singleDomain: '',
  whitelist: [],
  blacklist: [],
  imageMode: 'unavailable',
  serverUrl: 'http://localhost:3000',
  serverTtlMinutes: 15
};

function storageArea() {
  return browser.storage.sync ?? browser.storage.local;
}

export async function loadSettings(): Promise<Settings> {
  const stored = await storageArea().get('settings');
  return { ...DEFAULT_SETTINGS, ...((stored.settings as Partial<Settings>) ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await storageArea().set({ settings });
}
