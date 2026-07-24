/**
 * Валидатор OG-разметки по профилям соцсетей.
 *
 * Чистые функции: принимают собранные теги и предзагруженную информацию
 * о картинках (доставать их по сети — задача background), возвращают
 * отчёт с уровнями ok/warning/error по каждой соцсети и итоговым уровнем.
 */
import type { Check, ImageInfoMap, ImageRule, Level, MetaTag, NetworkReport, Profile, Report } from './types';

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

function checkTag(tags: MetaTag[], key: string, severity: Level, fallbacks?: Record<string, string>): Check {
  const { value, via } = resolveTag(tags, key, fallbacks);
  if (value !== null) {
    return { tag: key, status: 'ok', value, message: via ? `используется ${via}` : 'ок' };
  }
  const present = hasTag(tags, key);
  return {
    tag: key,
    status: severity,
    value: null,
    message: present ? 'пустое значение' : 'тег отсутствует'
  };
}

/** Человекочитаемый физический размер файла. */
function formatBytes(bytes?: number): string | null {
  if (bytes == null) return null;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

/** Проверка картинки по правилам профиля; null — тега нет (это уже отражено в required/recommended). */
function checkImage(
  rule: ImageRule,
  tags: MetaTag[],
  imageInfo: ImageInfoMap,
  fallbacks?: Record<string, string>
): Check | null {
  const { value: url } = resolveTag(tags, rule.tag, rule.fallbackTag ? { [rule.tag]: rule.fallbackTag } : fallbacks);
  if (!url) return null;

  const info = imageInfo[url];
  if (!info) {
    return { tag: rule.tag, status: 'warning', value: url, message: 'картинка не проверялась' };
  }
  if (rule.reachable && !info.reachable) {
    return { tag: rule.tag, status: 'error', value: url, message: 'картинка недоступна' };
  }
  const size = formatBytes(info.bytes);
  const sizeSuffix = size ? ` (${size})` : '';
  const dims = info.width && info.height ? `${info.width}×${info.height}` : null;
  if (info.width && info.height) {
    if ((rule.minWidth && info.width < rule.minWidth) || (rule.minHeight && info.height < rule.minHeight)) {
      return {
        tag: rule.tag,
        status: 'error',
        value: url,
        message: `картинка ${dims}${sizeSuffix} меньше минимума ${rule.minWidth}×${rule.minHeight}`
      };
    }
    if (
      (rule.recommendedWidth && info.width < rule.recommendedWidth) ||
      (rule.recommendedHeight && info.height < rule.recommendedHeight)
    ) {
      return {
        tag: rule.tag,
        status: 'warning',
        value: url,
        message: `картинка ${dims}${sizeSuffix} меньше рекомендуемых ${rule.recommendedWidth}×${rule.recommendedHeight}`
      };
    }
  }
  return {
    tag: rule.tag,
    status: 'ok',
    value: url,
    message: dims ? `картинка ок (${dims}${size ? `, ${size}` : ''})` : size ? `картинка доступна (${size})` : 'картинка доступна'
  };
}

/** Проверка одного профиля. */
export function validateProfile(profile: Profile, tags: MetaTag[], imageInfo: ImageInfoMap): NetworkReport {
  const checks: Check[] = [];
  for (const key of profile.required) {
    checks.push(checkTag(tags, key, 'error', profile.fallbacks));
  }
  for (const key of profile.recommended) {
    checks.push(checkTag(tags, key, 'warning', profile.fallbacks));
  }
  if (profile.image) {
    const imgCheck = checkImage(profile.image, tags, imageInfo, profile.fallbacks);
    if (imgCheck) checks.push(imgCheck);
  }
  const level = checks.reduce<Level>((acc, c) => worst(acc, c.status), 'ok');
  return { id: profile.id, name: profile.name, level, checks };
}

/** Полная проверка по выбранным профилям. */
export function validate(profiles: Profile[], tags: MetaTag[], imageInfo: ImageInfoMap): Report {
  const networks = profiles.map((p) => validateProfile(p, tags, imageInfo));
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
