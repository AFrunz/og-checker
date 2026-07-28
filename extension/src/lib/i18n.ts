/**
 * Локализация расширения (en/ru). Язык выбирается в настройках,
 * по умолчанию — английский (chrome.i18n не подходит: он привязан
 * к языку браузера и не переключается из приложения).
 *
 * Статичные тексты в HTML размечаются атрибутами data-i18n /
 * data-i18n-title / data-i18n-placeholder и переводятся applyI18n().
 */
import type { Lang } from './types';

type Dict = Record<string, string>;

const en: Dict = {
  // Popup
  'hdr.toggleTitle': 'Enable / disable the extension',
  'tab.check': 'Check',
  'tab.server': 'Server',
  'status.loading': 'Loading…',
  'status.noData': 'No data — reload the page',
  'status.disabled': 'Extension is disabled',
  'status.skipped': 'Page is out of the check scope',
  'status.busy': 'Checking…',
  'status.ok': 'Markup looks good',
  'status.warning': 'There are warnings',
  'status.error': 'Errors found',
  'btn.recheck': 'Check again',
  'site.disable': 'Disable for this site',
  'site.enable': 'Enable on this site',
  'srv.title': 'Server check',
  'srv.sub': 'A public link where social crawlers can see the page',
  'note.otherPage': 'different page',
  'note.renderedSource': 'captured from the DOM after JS — a real crawler may see the page differently',
  'copy.title': 'Copy link',
  'srv.noSession': 'No session yet',
  'timer.cap': 'until the session is deleted',
  'btn.extend': 'Extend +15 min',
  'btn.stop': 'Stop',
  'btn.send': 'Send page to server',
  'btn.resend': 'Capture and send again',
  'btn.sending': 'Sending…',
  'srv.note': 'The link lives for 15 minutes.',
  'foot.settings': 'Settings',
  'err.unknown': 'unknown error',
  'err.serverStatus': 'Server responded {status}',
  'err.noServerUrl': 'Server URL is not set in settings',
  'err.noPageData': 'Failed to get page data',
  'err.serverResponded': 'Server responded {status}: {text}',

  // Options
  'opt.docTitle': 'OG Checker — Settings',
  'opt.h1': 'OG Checker Settings',
  'opt.sub': 'OpenGraph markup checks for test and local environments',
  'opt.enabled.title': 'Extension enabled',
  'opt.enabled.desc': 'Globally turns all checks on and off',
  'opt.lang.h': 'Language',
  'opt.lang.desc': 'Interface and report language',
  'opt.networks.h': 'Social networks to check',
  'opt.networks.desc': 'Required and recommended tag sets for each network',
  'opt.scope.h': 'Check scope',
  'opt.scope.desc': 'Both lists are stored separately and survive mode switching',
  'opt.blacklist.title': 'All sites except the list · default',
  'opt.blacklist.desc': 'Blacklist. Check everywhere except the listed domains.',
  'opt.blacklist.ph': 'one pattern per line\nstaging.internal\n*.ads.example.com',
  'opt.whitelist.title': 'Only sites from the list',
  'opt.whitelist.desc': 'Whitelist. Check only on the listed domains.',
  'opt.whitelist.ph': 'localhost:3000\n*.dev.example.com',
  'opt.hint': 'Pattern — host[:port]. “*” matches any fragment; a pattern without a port matches any port.',
  'opt.server.h': 'Server check',
  'opt.server.desc': 'Server address and what to upload so crawlers can see the page',
  'opt.serverUrl.label': 'Server URL',
  'opt.images.h': 'Image upload',
  'opt.images.desc': 'So og:image is reachable for an external crawler',
  'opt.img.unavailable.title': 'Only externally unreachable',
  'opt.img.unavailable.desc': 'localhost and private addresses. Public images stay as is.',
  'opt.img.all.title': 'Upload all og images',
  'opt.img.all.desc': 'All images are uploaded to the server, links are rewritten.',
  'opt.img.none.title': 'Do not upload',
  'opt.img.none.desc': 'Only the page is served; image links stay as is.',
  'btn.save': 'Save changes',
  'opt.saved': '✓ Saved',

  // Validator
  'v.ok': 'ok',
  'v.uses': 'uses {tag}',
  'v.empty': 'empty value',
  'v.missing': 'tag is missing',
  'v.jsOnly': '{tag} appears only after JS — crawlers will not see it',
  'v.jsChanged': 'JS changes the value (crawlers will see: “{value}”)',
  'v.imgUnchecked': 'image was not checked',
  'v.imgUnreachable': 'image is unreachable',
  'v.imgTooSmall': 'image {actual} is below the minimum {min}',
  'v.imgBelowRec': 'image {actual} is below the recommended {rec}',
  'v.imgOk': 'image OK ({detail})',
  'v.imgReachable': 'image is reachable',
  'v.imgReachableDetail': 'image is reachable ({detail})',
  'unit.mb': 'MB',
  'unit.kb': 'KB'
};

const ru: Dict = {
  'hdr.toggleTitle': 'Включить / выключить расширение',
  'tab.check': 'Проверка',
  'tab.server': 'Сервер',
  'status.loading': 'Загрузка…',
  'status.noData': 'Нет данных — обновите страницу',
  'status.disabled': 'Расширение выключено',
  'status.skipped': 'Страница вне области проверки',
  'status.busy': 'Проверка выполняется…',
  'status.ok': 'Разметка в порядке',
  'status.warning': 'Есть замечания',
  'status.error': 'Найдены ошибки',
  'btn.recheck': 'Проверить снова',
  'site.disable': 'Отключить для этого сайта',
  'site.enable': 'Включить на этом сайте',
  'srv.title': 'Серверная проверка',
  'srv.sub': 'Публичная ссылка, по которой краулеры соцсетей увидят страницу',
  'note.otherPage': 'другая страница',
  'note.renderedSource': 'снято из DOM после JS — реальный краулер может видеть страницу иначе',
  'copy.title': 'Скопировать ссылку',
  'srv.noSession': 'Сессия не создана',
  'timer.cap': 'до удаления сессии',
  'btn.extend': 'Продлить +15 мин',
  'btn.stop': 'Остановить',
  'btn.send': 'Отправить страницу на сервер',
  'btn.resend': 'Снять и отправить заново',
  'btn.sending': 'Отправка…',
  'srv.note': 'Ссылка живёт 15 минут.',
  'foot.settings': 'Настройки',
  'err.unknown': 'неизвестная ошибка',
  'err.serverStatus': 'Сервер ответил {status}',
  'err.noServerUrl': 'Адрес сервера не задан в настройках',
  'err.noPageData': 'Не удалось получить данные страницы',
  'err.serverResponded': 'Сервер ответил {status}: {text}',

  'opt.docTitle': 'OG Checker — настройки',
  'opt.h1': 'Настройки OG Checker',
  'opt.sub': 'Проверка OpenGraph-разметки в тестовом и локальном окружении',
  'opt.enabled.title': 'Расширение включено',
  'opt.enabled.desc': 'Глобально включает и выключает все проверки',
  'opt.lang.h': 'Язык',
  'opt.lang.desc': 'Язык интерфейса и отчётов',
  'opt.networks.h': 'Соцсети для проверки',
  'opt.networks.desc': 'Наборы обязательных и рекомендуемых тегов для каждой сети',
  'opt.scope.h': 'Область проверки',
  'opt.scope.desc': 'Оба списка хранятся отдельно и не сбрасываются при переключении режима',
  'opt.blacklist.title': 'Все сайты, кроме списка · по умолчанию',
  'opt.blacklist.desc': 'Чёрный список. Проверяем везде, кроме указанных доменов.',
  'opt.blacklist.ph': 'по одному шаблону на строку\nstaging.internal\n*.ads.example.com',
  'opt.whitelist.title': 'Только сайты из списка',
  'opt.whitelist.desc': 'Белый список. Проверяем только на указанных доменах.',
  'opt.whitelist.ph': 'localhost:3000\n*.dev.example.com',
  'opt.hint': 'Шаблон — host[:port]. «*» — любой фрагмент; шаблон без порта совпадает с любым портом.',
  'opt.server.h': 'Серверная проверка',
  'opt.server.desc': 'Адрес сервера и что сохранять, чтобы краулеры увидели страницу',
  'opt.serverUrl.label': 'Адрес сервера',
  'opt.images.h': 'Сохранение картинок',
  'opt.images.desc': 'Чтобы og:image были доступны внешнему краулеру',
  'opt.img.unavailable.title': 'Только недоступные извне',
  'opt.img.unavailable.desc': 'localhost и приватные адреса. Публичные картинки не трогаем.',
  'opt.img.all.title': 'Сохранять все og-картинки',
  'opt.img.all.desc': 'Все изображения выкладываются на сервер, ссылки переписываются.',
  'opt.img.none.title': 'Не сохранять',
  'opt.img.none.desc': 'Раздаётся только HTML, ссылки на картинки остаются как есть.',
  'btn.save': 'Сохранить изменения',
  'opt.saved': '✓ Сохранено',

  'v.ok': 'ок',
  'v.uses': 'используется {tag}',
  'v.empty': 'пустое значение',
  'v.missing': 'тег отсутствует',
  'v.jsOnly': '{tag} появляется только после JS — краулеры его не увидят',
  'v.jsChanged': 'JS меняет значение (краулер увидит: «{value}»)',
  'v.imgUnchecked': 'картинка не проверялась',
  'v.imgUnreachable': 'картинка недоступна',
  'v.imgTooSmall': 'картинка {actual} меньше минимума {min}',
  'v.imgBelowRec': 'картинка {actual} меньше рекомендуемых {rec}',
  'v.imgOk': 'картинка ок ({detail})',
  'v.imgReachable': 'картинка доступна',
  'v.imgReachableDetail': 'картинка доступна ({detail})',
  'unit.mb': 'МБ',
  'unit.kb': 'КБ'
};

const DICTS: Record<Lang, Dict> = { en, ru };

export type Translate = (key: string, params?: Record<string, string | number>) => string;

export function getT(lang: Lang): Translate {
  const dict = DICTS[lang] ?? en;
  return (key, params) => {
    let s = dict[key] ?? en[key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        s = s.replaceAll(`{${name}}`, String(value));
      }
    }
    return s;
  };
}

/** Формы множественного числа для счётчиков в отчёте. */
export function pluralForm(lang: Lang, n: number, kind: 'errors' | 'warnings'): string {
  if (lang === 'ru') {
    const forms = kind === 'errors' ? ['ошибка', 'ошибки', 'ошибок'] : ['замечание', 'замечания', 'замечаний'];
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return forms[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
    return forms[2];
  }
  if (kind === 'errors') return n === 1 ? 'error' : 'errors';
  return n === 1 ? 'warning' : 'warnings';
}

/** Переводит статичную разметку: data-i18n, data-i18n-title, data-i18n-placeholder. */
export function applyI18n(root: Document, t: Translate): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n as string);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle as string);
  }
  for (const el of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-i18n-placeholder]')) {
    el.placeholder = t(el.dataset.i18nPlaceholder as string);
  }
}
