/* Popup: статус проверки активной вкладки, глобальный ползунок, серверная сессия. */
import browser from 'webextension-polyfill';
import { loadSettings, saveSettings } from '../lib/settings';
import type { Level, Settings, ServerSession, TabResult } from '../lib/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

let activeTabId: number | null = null;
let currentHost: string | null = null;
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

function statusSvg(level: Level): string {
  if (level === 'ok') return '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.4l2.4 2.4 4.6-5"/></svg>';
  if (level === 'error') return '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>';
  return '<svg class="ico" viewBox="0 0 24 24"><path d="M12 4.5l8.5 14.5h-17z"/><path d="M12 10v4"/><path d="M12 16.8h.01"/></svg>';
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function fmtRemaining(ms: number): string {
  if (ms <= 0) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Табы
// ---------------------------------------------------------------------------

function activateTab(name: 'check' | 'server'): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>('.tab')) {
    btn.classList.toggle('is-active', btn.dataset.tab === name);
  }
  ($('panelCheck') as HTMLElement).hidden = name !== 'check';
  ($('panelServer') as HTMLElement).hidden = name !== 'server';
}

// ---------------------------------------------------------------------------
// Отчёт локальной проверки
// ---------------------------------------------------------------------------

function renderSkeleton(count = 5): void {
  const box = $('report');
  box.textContent = '';
  for (let i = 0; i < count; i++) {
    const row = document.createElement('div');
    row.className = 'skel-row';
    const left = document.createElement('div');
    left.className = 'skel-left';
    const dot = document.createElement('span');
    dot.className = 'skel skel-dot';
    const bar = document.createElement('span');
    bar.className = 'skel skel-bar';
    bar.style.width = `${88 + (i % 3) * 34}px`;
    left.append(dot, bar);
    const pill = document.createElement('span');
    pill.className = 'skel skel-pill';
    row.append(left, pill);
    box.append(row);
  }
}

function showBusy(): void {
  const statusLine = $('statusLine');
  statusLine.className = 'status';
  statusLine.textContent = STATUS_TEXT.busy;
  renderSkeleton();
}

function renderReport(result: TabResult | null): void {
  const box = $('report');
  box.textContent = '';
  const statusLine = $('statusLine');
  const recheck = $<HTMLButtonElement>('recheckBtn');

  if (!result || result.status === 'busy') {
    if (result && result.status === 'busy') {
      recheck.disabled = true;
      showBusy();
      return;
    }
    recheck.disabled = false;
    statusLine.className = 'status';
    statusLine.textContent = 'Нет данных — обновите страницу';
    return;
  }
  if (result.status === 'disabled' || result.status === 'skipped') {
    recheck.disabled = true;
    statusLine.className = 'status ' + result.status;
    statusLine.textContent = STATUS_TEXT[result.status];
    return;
  }
  recheck.disabled = false;

  const report = result.report;
  if (!report) return;
  statusLine.className = 'status ' + report.level;
  statusLine.textContent = STATUS_TEXT[report.level];

  for (const net of report.networks) {
    const details = document.createElement('details');
    details.className = 'network ' + net.level;
    if (net.level !== 'ok') details.open = true;

    const total = net.checks.length;
    const problems = net.checks.filter((c) => c.status !== 'ok').length;
    let countText: string;
    if (net.level === 'ok') countText = `${total}/${total}`;
    else if (net.level === 'error') countText = `${problems} ${pluralRu(problems, 'ошибка', 'ошибки', 'ошибок')}`;
    else countText = `${problems} ${pluralRu(problems, 'замечание', 'замечания', 'замечаний')}`;

    const summary = document.createElement('summary');
    const left = document.createElement('span');
    left.className = 'left';
    const sIco = document.createElement('span');
    sIco.className = 's-ico ' + net.level;
    sIco.innerHTML = statusSvg(net.level);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = net.name;
    left.append(sIco, name);

    const right = document.createElement('span');
    right.className = 'right';
    const count = document.createElement('span');
    count.className = 'count ' + net.level;
    count.textContent = countText;
    const chev = document.createElement('span');
    chev.className = 'chev';
    right.append(count, chev);

    summary.append(left, right);
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
// Тумблер «проверять этот сайт»
// ---------------------------------------------------------------------------

function renderSiteToggle(settings: Settings): void {
  const btn = $<HTMLButtonElement>('siteToggleBtn');
  if (!settings.enabled || !currentHost) {
    btn.hidden = true;
    return;
  }
  const wl = settings.scopeMode === 'whitelist';
  const list = wl ? settings.whitelist : settings.blacklist;
  const listed = list.includes(currentHost);
  const checked = wl ? listed : !listed; // проверяется ли сейчас этот сайт
  btn.hidden = false;
  btn.textContent = checked ? 'Отключить для этого сайта' : 'Включить на этом сайте';
}

async function toggleSite(): Promise<void> {
  if (!currentHost) return;
  const s = await loadSettings();
  const wl = s.scopeMode === 'whitelist';
  const key = wl ? 'whitelist' : 'blacklist';
  const list = [...s[key]];
  const listed = list.includes(currentHost);
  const checked = wl ? listed : !listed;
  const add = () => { if (!listed) list.push(currentHost as string); };
  const remove = () => { const i = list.indexOf(currentHost as string); if (i >= 0) list.splice(i, 1); };
  if (checked) { wl ? remove() : add(); } // выключаем проверку
  else { wl ? add() : remove(); }        // включаем проверку
  await saveSettings({ ...s, [key]: list });
  setTimeout(() => void init(), 300);
}

// ---------------------------------------------------------------------------
// Серверная сессия
// ---------------------------------------------------------------------------

function updateSendLabel(): void {
  const btn = $('sendBtn');
  if (currentSession) {
    btn.textContent = 'Снять и отправить заново';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-outline');
  } else {
    btn.textContent = 'Отправить страницу на сервер';
    btn.classList.remove('btn-outline');
    btn.classList.add('btn-primary');
  }
}

function renderSession(session: ServerSession | null, remainingMs?: number): void {
  currentSession = session;
  clearInterval(timerInterval);
  updateSendLabel();

  const link = $<HTMLAnchorElement>('sessionLink');
  const extend = $<HTMLButtonElement>('extendBtn');
  const stop = $<HTMLButtonElement>('stopBtn');
  const copy = $<HTMLButtonElement>('copyBtn');

  if (!session) {
    link.removeAttribute('href');
    link.textContent = 'Сессия не создана';
    link.classList.add('inactive');
    $('timer').textContent = '–:–';
    extend.disabled = true;
    stop.disabled = true;
    copy.disabled = true;
    return;
  }

  link.classList.remove('inactive');
  extend.disabled = false;
  stop.disabled = false;
  copy.disabled = false;
  link.href = session.publicUrl;
  link.textContent = session.publicUrl.replace(/^https?:\/\//, '');

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

  currentHost = null;
  if (tab?.url) {
    try {
      const url = new URL(tab.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        currentHost = url.host.toLowerCase();
        $('siteDomain').textContent = url.host;
      } else {
        $('siteDomain').textContent = url.protocol.replace(':', '');
      }
    } catch {
      $('siteDomain').textContent = '—';
    }
  } else {
    $('siteDomain').textContent = '—';
  }

  const settings = await loadSettings();
  const state = (await browser.runtime.sendMessage({ type: 'ogc:getState', tabId: activeTabId })) as PopupState;
  $<HTMLInputElement>('enabledToggle').checked = settings.enabled;
  renderReport(state.result);
  renderSiteToggle(settings);
  void refreshSessionFromServer(state.serverSession);
}

$('tabCheck').addEventListener('click', () => activateTab('check'));
$('tabServer').addEventListener('click', () => activateTab('server'));

$<HTMLInputElement>('enabledToggle').addEventListener('change', async (e) => {
  const settings = await loadSettings();
  await saveSettings({ ...settings, enabled: (e.target as HTMLInputElement).checked });
  setTimeout(() => void init(), 300); // дать background перепроверить вкладку
});

$('recheckBtn').addEventListener('click', async () => {
  $<HTMLButtonElement>('recheckBtn').disabled = true;
  showBusy();
  await browser.runtime.sendMessage({ type: 'ogc:recheck', tabId: activeTabId });
  setTimeout(() => void init(), 500);
});

$('siteToggleBtn').addEventListener('click', () => void toggleSite());

$('copyBtn').addEventListener('click', () => {
  if (currentSession) void navigator.clipboard?.writeText(currentSession.publicUrl).catch(() => {});
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
    updateSendLabel();
  }
});

$('extendBtn').addEventListener('click', () => void sessionAction('/extend', 'POST'));
$('stopBtn').addEventListener('click', () => void sessionAction('', 'DELETE'));

$('openOptions').addEventListener('click', (e) => {
  e.preventDefault();
  void browser.runtime.openOptionsPage();
});

void init();
