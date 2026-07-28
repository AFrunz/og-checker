/**
 * Валидатор OG-разметки по профилям соцсетей.
 *
 * Чистые функции: принимают собранные теги и предзагруженную информацию
 * о картинках (доставать их по сети — задача background), возвращают
 * отчёт с уровнями ok/warning/error по каждой соцсети и итоговым уровнем.
 */
import { getT, type Translate } from './i18n';
import type { Check, ImageInfoMap, ImageRule, Lang, Level, MetaTag, NetworkReport, Profile, Report } from './types';

const LEVELS: Record<Level, number> = { ok: 0, warning: 1, error: 2 };

export function worst(a: Level, b: Level): Level {
  return LEVELS[b] > LEVELS[a] ? b : a;
}

function firstValue(tags: MetaTag[], key: string): string | null {
  const t = tags.find((x) => x.key === key && x.value !== '');
  return t ? t.value : null;
}

function hasTag(tags: MetaTag[], key: string): boolean {
  return tags.some((x) => x.key === key);
}

/** Разрешает значение тега с учётом фолбэков профиля. */
function resolveTag(
  tags: MetaTag[],
  key: string,
  fallbacks?: Record<string, string>
): { value: string | null; via: string | null } {
  const direct = firstValue(tags, key);
  if (direct !== null) return { value: direct, via: null };
  const fb = fallbacks?.[key];
  if (fb) {
    const fbValue = firstValue(tags, fb);
    if (fbValue !== null) return { value: fbValue, via: fb };
  }
  return { value: null, via: null };
}

function checkTag(
  tags: MetaTag[],
  key: string,
  severity: Level,
  t: Translate,
  fallbacks?: Record<string, string>,
  staticTags?: MetaTag[] | null
): Check {
  const { value, via } = resolveTag(tags, key, fallbacks);
  if (value !== null) {
    // Тег есть в живом DOM — сверяем со статическим HTML: соц-краулеры JS
    // не исполняют, поэтому тег, которого нет в статике, они не увидят.
    if (staticTags) {
      const usedKey = via ?? key;
      const staticValue = firstValue(staticTags, usedKey);
      if (staticValue === null) {
        return { tag: key, status: 'warning', value, message: t('v.jsOnly', { tag: usedKey }) };
      }
      if (staticValue !== value) {
        return { tag: key, status: 'warning', value, message: t('v.jsChanged', { value: staticValue }) };
      }
    }
    return { tag: key, status: 'ok', value, message: via ? t('v.uses', { tag: via }) : t('v.ok') };
  }
  const present = hasTag(tags, key);
  return {
    tag: key,
    status: severity,
    value: null,
    message: present ? t('v.empty') : t('v.missing')
  };
}

/** Человекочитаемый физический размер файла. */
function formatBytes(t: Translate, bytes?: number): string | null {
  if (bytes == null) return null;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} ${t('unit.mb')}`;
  return `${Math.max(1, Math.round(bytes / 1024))} ${t('unit.kb')}`;
}

/** Проверка картинки по правилам профиля; null — тега нет (это уже отражено в required/recommended). */
function checkImage(
  rule: ImageRule,
  tags: MetaTag[],
  imageInfo: ImageInfoMap,
  t: Translate,
  fallbacks?: Record<string, string>
): Check | null {
  const { value: url } = resolveTag(tags, rule.tag, rule.fallbackTag ? { [rule.tag]: rule.fallbackTag } : fallbacks);
  if (!url) return null;

  const info = imageInfo[url];
  if (!info) {
    return { tag: rule.tag, status: 'warning', value: url, message: t('v.imgUnchecked') };
  }
  if (rule.reachable && !info.reachable) {
    return { tag: rule.tag, status: 'error', value: url, message: t('v.imgUnreachable') };
  }
  const size = formatBytes(t, info.bytes);
  const sizeSuffix = size ? ` (${size})` : '';
  const dims = info.width && info.height ? `${info.width}×${info.height}` : null;
  if (dims) {
    const actual = `${dims}${sizeSuffix}`;
    if ((rule.minWidth && info.width! < rule.minWidth) || (rule.minHeight && info.height! < rule.minHeight)) {
      return {
        tag: rule.tag,
        status: 'error',
        value: url,
        message: t('v.imgTooSmall', { actual, min: `${rule.minWidth}×${rule.minHeight}` })
      };
    }
    if (
      (rule.recommendedWidth && info.width! < rule.recommendedWidth) ||
      (rule.recommendedHeight && info.height! < rule.recommendedHeight)
    ) {
      return {
        tag: rule.tag,
        status: 'warning',
        value: url,
        message: t('v.imgBelowRec', { actual, rec: `${rule.recommendedWidth}×${rule.recommendedHeight}` })
      };
    }
  }
  return {
    tag: rule.tag,
    status: 'ok',
    value: url,
    message: dims
      ? t('v.imgOk', { detail: `${dims}${size ? `, ${size}` : ''}` })
      : size
        ? t('v.imgReachableDetail', { detail: size })
        : t('v.imgReachable')
  };
}

/**
 * Проверка одного профиля.
 * @param staticTags теги из исходного HTML (без JS); null/undefined — сверка недоступна
 * @param lang язык сообщений в отчёте (по умолчанию английский)
 */
export function validateProfile(
  profile: Profile,
  tags: MetaTag[],
  imageInfo: ImageInfoMap,
  staticTags?: MetaTag[] | null,
  lang: Lang = 'en'
): NetworkReport {
  const t = getT(lang);
  const checks: Check[] = [];
  for (const key of profile.required) {
    checks.push(checkTag(tags, key, 'error', t, profile.fallbacks, staticTags));
  }
  for (const key of profile.recommended) {
    checks.push(checkTag(tags, key, 'warning', t, profile.fallbacks, staticTags));
  }
  if (profile.image) {
    const imgCheck = checkImage(profile.image, tags, imageInfo, t, profile.fallbacks);
    if (imgCheck) checks.push(imgCheck);
  }
  const level = checks.reduce<Level>((acc, c) => worst(acc, c.status), 'ok');
  return { id: profile.id, name: profile.name, level, checks };
}

/** Полная проверка по выбранным профилям. */
export function validate(
  profiles: Profile[],
  tags: MetaTag[],
  imageInfo: ImageInfoMap,
  staticTags?: MetaTag[] | null,
  lang: Lang = 'en'
): Report {
  const networks = profiles.map((p) => validateProfile(p, tags, imageInfo, staticTags, lang));
  const level = networks.reduce<Level>((acc, n) => worst(acc, n.level), 'ok');
  return { level, networks, tagCount: tags.length };
}

/** URL картинок, которые нужно проверить для набора профилей. */
export function collectImageUrls(profiles: Profile[], tags: MetaTag[]): string[] {
  const urls = new Set<string>();
  for (const p of profiles) {
    if (!p.image) continue;
    const { value } = resolveTag(
      tags,
      p.image.tag,
      p.image.fallbackTag ? { [p.image.tag]: p.image.fallbackTag } : p.fallbacks
    );
    if (value) urls.add(value);
  }
  return [...urls];
}
