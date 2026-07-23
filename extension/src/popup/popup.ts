/* Popup: статус проверки активной вкладки, глобальный ползунок, серверная сессия. */
import browser from 'webextension-polyfill';
import { loadSettings, saveSettings } from '../lib/settings';
import type { Level, ServerSession, TabResult } from '../lib/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

let activeTabId: number | null = null;
let timerInterval: ReturnType<typeof setInterval> | undefined;
let currentSession: ServerSession | null = null;

const STATUS_TEXT: Record<string, string> = {
  disabled: 'Расширение выключено',
  skipped: 'Страница вне области проверки',
  busy: 'Проверка выполняется…',
  ok: 'Разметка в порядке',
  warning: 'Есть замечания',
  error: 'Найдены ошибки'
};

const NET_BADGE: Record<Level, string> = { ok: 'ок', warning: 'замечания', error: 'ошибки' };

function fmtRemaining(ms: number): string {
  if (ms <= 0) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Отчёт локальной проверки
// ---------------------------------------------------------------------------

function renderReport(result: TabResult | null): void {
  const box = $('report');
  box.textContent = '';
  const statusLine = $('statusLine');

  if (!result || result.status === 'busy') {
    statusLine.className = 'status';
    statusLine.textContent = result ? STATUS_TEXT.busy : 'Нет данных — обновите страницу';
    return;
  }
  if (result.status === 'disabled' || result.status === 'skipped') {
    statusLine.className = 'status ' + result.status;
    statusLine.textContent = STATUS_TEXT[result.status];
    return;
  }

  const report = result.report;
  if (!report) return;
  statusLine.className = 'status ' + report.level;
  statusLine.textContent = STATUS_TEXT[report.level];

  for (const net of report.networks) {
    const details = document.createElement('details');
    details.className = 'network';
    if (net.level !== 'ok') details.open = true;

    const summary = document.createElement('summary');
    const name = document.createElement('span');
    name.textContent = net.name;
    const badge = document.createElement('span');
    badge.className = 'badge ' + net.level;
    badge.textContent = NET_BADGE[net.level];
    summary.append(name, badge);
    details.append(summary);

    const ul = document.createElement('ul');
    ul.className = 'checks';
    for (const check of net.checks) {
      const li = document.createElement('li');
      li.className = check.status;
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = check.tag;
      const msg = document.createElement('span');
      msg.className = 'msg';
      msg.textContent = check.message;
      li.append(tag, msg);
      ul.append(li);
    }
    details.append(ul);
    box.append(details);
  }
}

// ---------------------------------------------------------------------------
// Серверная сессия
// ---------------------------------------------------------------------------

function renderSession(session: ServerSession | null, remainingMs?: number): void {
  currentSession = session;
  const box = $('sessionBox');
  const state = $('serverState');
  clearInterval(timerInterval);

  if (!session) {
    box.hidden = true;
    state.hidden = false;
    state.textContent = 'Нет активной сессии';
    return;
  }

  box.hidden = false;
  state.hidden = true;
  const link = $<HTMLAnchorElement>('sessionLink');
  link.href = session.publicUrl;
  link.textContent = session.publicUrl;

  const expiresAt = remainingMs != null ? Date.now() + remainingMs : session.expiresAt;
  const tick = () => {
    const left = expiresAt - Date.now();
    $('timer').textContent = fmtRemaining(left);
    if (left <= 0) {
      clearInterval(timerInterval);
      browser.runtime.sendMessage({ type: 'ogc:clearSession' }).catch(() => {});
      renderSession(null);
    }
  };
  tick();
  timerInterval = setInterval(tick, 1000);
}

async function refreshSessionFromServer(session: ServerSession | null): Promise<void> {
  if (!session) {
    renderSession(null);
    return;
  }
  try {
    const resp = await fetch(`${session.serverUrl}/api/sessions/${session.id}`, {
      headers: { 'X-Owner-Token': session.ownerToken },
      credentials: 'include'
    });
    if (resp.status === 404) {
      await browser.runtime.sendMessage({ type: 'ogc:clearSession' });
      renderSession(null);
      return;
    }
    const data = (await resp.json()) as { remainingMs: number };
    renderSession(session, data.remainingMs);
  } catch {
    // сервер недоступен — показываем по локальному expiresAt
    renderSession(session);
  }
}

function showServerError(text: string): void {
  const el = $('serverError');
  el.hidden = !text;
  el.textContent = text;
}

async function sessionAction(path: string, method: 'POST' | 'DELETE'): Promise<void> {
  if (!currentSession) return;
  showServerError('');
  try {
    const resp = await fetch(`${currentSession.serverUrl}/api/sessions/${currentSession.id}${path}`, {
      method,
      headers: { 'X-Owner-Token': currentSession.ownerToken },
      credentials: 'include'
    });
    if (!resp.ok && resp.status !== 404) {
      throw new Error('Сервер ответил ' + resp.status);
    }
    if (method === 'DELETE' || resp.status === 404) {
      await browser.runtime.sendMessage({ type: 'ogc:clearSession' });
      renderSession(null);
    } else {
      const data = (await resp.json()) as { remainingMs: number };
      renderSession(currentSession, data.remainingMs);
    }
  } catch (e) {
    showServerError((e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Инициализация и обработчики
// ---------------------------------------------------------------------------

interface PopupState {
  settings: { enabled: boolean };
  result: TabResult | null;
  serverSession: ServerSession | null;
}

async function init(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;

  const state = (await browser.runtime.sendMessage({ type: 'ogc:getState', tabId: activeTabId })) as PopupState;
  $<HTMLInputElement>('enabledToggle').checked = state.settings.enabled;
  renderReport(state.result);
  void refreshSessionFromServer(state.serverSession);
}

$<HTMLInputElement>('enabledToggle').addEventListener('change', async (e) => {
  const settings = await loadSettings();
  await saveSettings({ ...settings, enabled: (e.target as HTMLInputElement).checked });
  setTimeout(() => void init(), 300); // дать background перепроверить вкладку
});

$('recheckBtn').addEventListener('click', async () => {
  await browser.runtime.sendMessage({ type: 'ogc:recheck', tabId: activeTabId });
  setTimeout(() => void init(), 500);
});

$<HTMLButtonElement>('sendBtn').addEventListener('click', async () => {
  const btn = $<HTMLButtonElement>('sendBtn');
  showServerError('');
  btn.disabled = true;
  btn.textContent = 'Отправка…';
  try {
    const res = (await browser.runtime.sendMessage({ type: 'ogc:createSession', tabId: activeTabId })) as {
      ok: boolean;
      session?: ServerSession;
      error?: string;
    };
    if (!res.ok || !res.session) throw new Error(res.error ?? 'неизвестная ошибка');
    renderSession(res.session);
  } catch (e) {
    showServerError((e as Error).message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Отправить страницу на сервер';
  }
});

$('extendBtn').addEventListener('click', () => void sessionAction('/extend', 'POST'));
$('stopBtn').addEventListener('click', () => void sessionAction('', 'DELETE'));

$('openOptions').addEventListener('click', (e) => {
  e.preventDefault();
  void browser.runtime.openOptionsPage();
});

void init();
