import test from 'node:test';
import assert from 'node:assert/strict';

import { getProfile, PROFILES } from '../src/lib/profiles';
import { collectImageUrls, validate, validateProfile } from '../src/lib/validator';
import type { ImageInfoMap, MetaTag, Profile } from '../src/lib/types';

const t = (key: string, value: string): MetaTag => ({ key, value });
const profile = (id: string): Profile => {
  const p = getProfile(id);
  assert.ok(p, `профиль ${id} должен существовать`);
  return p;
};

const FULL_TAGS: MetaTag[] = [
  t('og:title', 'Заголовок'),
  t('og:type', 'website'),
  t('og:image', 'https://cdn.example.com/pic.png'),
  t('og:url', 'https://example.com/'),
  t('og:description', 'Описание'),
  t('og:site_name', 'Example'),
  t('fb:app_id', '123')
];

const IMG_OK: ImageInfoMap = { 'https://cdn.example.com/pic.png': { reachable: true, width: 1200, height: 630 } };

test('полный набор тегов -> ok', () => {
  const res = validateProfile(profile('facebook'), FULL_TAGS, IMG_OK);
  assert.equal(res.level, 'ok');
});

test('отсутствие обязательного тега -> error', () => {
  const tags = FULL_TAGS.filter((x) => x.key !== 'og:title');
  const res = validateProfile(profile('facebook'), tags, IMG_OK);
  assert.equal(res.level, 'error');
  const check = res.checks.find((c) => c.tag === 'og:title');
  assert.ok(check);
  assert.equal(check.status, 'error');
  assert.match(check.message, /отсутствует/);
});

test('пустое значение обязательного тега -> error с отдельным сообщением', () => {
  const tags = FULL_TAGS.map((x) => (x.key === 'og:title' ? t('og:title', '') : x));
  const res = validateProfile(profile('facebook'), tags, IMG_OK);
  assert.equal(res.level, 'error');
  assert.match(res.checks.find((c) => c.tag === 'og:title')!.message, /пустое/);
});

test('отсутствие рекомендуемого тега -> warning', () => {
  const tags = FULL_TAGS.filter((x) => x.key !== 'og:description');
  const res = validateProfile(profile('facebook'), tags, IMG_OK);
  assert.equal(res.level, 'warning');
});

test('twitter: фолбэк на og:* делает проверку пройденной', () => {
  const tags = [...FULL_TAGS, t('twitter:card', 'summary_large_image')];
  const res = validateProfile(profile('twitter'), tags, IMG_OK);
  const title = res.checks.find((c) => c.tag === 'twitter:title');
  assert.ok(title);
  assert.equal(title.status, 'ok');
  assert.match(title.message, /og:title/);
});

test('twitter: без карточки -> error', () => {
  const res = validateProfile(profile('twitter'), FULL_TAGS, IMG_OK);
  assert.equal(res.checks.find((c) => c.tag === 'twitter:card')!.status, 'error');
});

test('недоступная картинка -> error', () => {
  const info: ImageInfoMap = { 'https://cdn.example.com/pic.png': { reachable: false } };
  const res = validateProfile(profile('facebook'), FULL_TAGS, info);
  assert.equal(res.level, 'error');
  const imgCheck = res.checks.find((c) => c.tag === 'og:image' && /картинка/.test(c.message));
  assert.ok(imgCheck);
  assert.match(imgCheck.message, /недоступна/);
});

test('картинка меньше минимума -> error, меньше рекомендуемой -> warning', () => {
  const small: ImageInfoMap = { 'https://cdn.example.com/pic.png': { reachable: true, width: 100, height: 100 } };
  assert.equal(validateProfile(profile('facebook'), FULL_TAGS, small).level, 'error');
  const mid: ImageInfoMap = { 'https://cdn.example.com/pic.png': { reachable: true, width: 600, height: 315 } };
  assert.equal(validateProfile(profile('facebook'), FULL_TAGS, mid).level, 'warning');
});

test('итоговый уровень — худший из сетей', () => {
  const tags = FULL_TAGS.filter((x) => x.key !== 'og:description'); // warning для FB
  const res = validate(
    PROFILES.filter((p) => ['facebook', 'twitter'].includes(p.id)),
    tags,
    IMG_OK
  );
  assert.equal(res.level, 'error'); // twitter:card отсутствует
});

test('collectImageUrls собирает URL с учётом фолбэков', () => {
  const urls = collectImageUrls(PROFILES, [...FULL_TAGS, t('twitter:card', 'summary')]);
  assert.deepEqual(urls, ['https://cdn.example.com/pic.png']);
});

// --- сверка со статическим HTML (краулеры JS не исполняют) ---

test('тег только в DOM (нет в статике) -> warning про JS', () => {
  const staticTags = FULL_TAGS.filter((x) => x.key !== 'og:title'); // og:title добавлен JS-ом
  const res = validateProfile(profile('facebook'), FULL_TAGS, IMG_OK, staticTags);
  const check = res.checks.find((c) => c.tag === 'og:title');
  assert.ok(check);
  assert.equal(check.status, 'warning');
  assert.match(check.message, /только после JS/);
  assert.equal(res.level, 'warning');
});

test('JS меняет значение тега -> warning со статическим значением', () => {
  const staticTags = FULL_TAGS.map((x) => (x.key === 'og:title' ? t('og:title', 'Старый заголовок') : x));
  const res = validateProfile(profile('facebook'), FULL_TAGS, IMG_OK, staticTags);
  const check = res.checks.find((c) => c.tag === 'og:title');
  assert.ok(check);
  assert.equal(check.status, 'warning');
  assert.match(check.message, /Старый заголовок/);
});

test('фолбэк-тег сверяется по фактически использованному ключу', () => {
  // twitter:title берётся из og:title; og:title есть только в DOM
  const live = [...FULL_TAGS, t('twitter:card', 'summary_large_image')];
  const staticTags = live.filter((x) => x.key !== 'og:title');
  const res = validateProfile(profile('twitter'), live, IMG_OK, staticTags);
  const check = res.checks.find((c) => c.tag === 'twitter:title');
  assert.ok(check);
  assert.equal(check.status, 'warning');
  assert.match(check.message, /og:title/);
});

test('статика совпадает или недоступна (null) -> без warning', () => {
  assert.equal(validateProfile(profile('facebook'), FULL_TAGS, IMG_OK, FULL_TAGS).level, 'ok');
  assert.equal(validateProfile(profile('facebook'), FULL_TAGS, IMG_OK, null).level, 'ok');
  assert.equal(validateProfile(profile('facebook'), FULL_TAGS, IMG_OK).level, 'ok');
});
