/**
 * Конфиг профилей соцсетей.
 *
 * Каждый профиль описывает правила проверки OG-разметки для одной соцсети:
 *  - required:    отсутствие/пустое значение тега -> error
 *  - recommended: отсутствие тега -> warning
 *  - fallbacks:   { тег: тег-замена } — если прямого тега нет, но есть замена,
 *                 проверка считается пройденной (краулер сам делает фолбэк)
 *  - image:       правила для картинки: доступность (error), минимальные
 *                 размеры (error), рекомендуемые размеры (warning)
 *
 * Новая соцсеть добавляется записью в этот файл, код менять не нужно.
 */
import type { Profile } from './types';

export const PROFILES: Profile[] = [
  {
    id: 'facebook',
    name: 'Facebook / WhatsApp',
    required: ['og:title', 'og:type', 'og:image', 'og:url'],
    recommended: ['og:description', 'og:site_name', 'fb:app_id'],
    image: {
      tag: 'og:image',
      reachable: true,
      minWidth: 200,
      minHeight: 200,
      recommendedWidth: 1200,
      recommendedHeight: 630
    }
  },
  {
    id: 'vk',
    name: 'VK',
    required: ['og:title', 'og:image', 'og:url'],
    recommended: ['og:description', 'og:type', 'og:site_name'],
    image: {
      tag: 'og:image',
      reachable: true,
      minWidth: 200,
      minHeight: 200,
      recommendedWidth: 1200,
      recommendedHeight: 630
    }
  },
  {
    id: 'telegram',
    name: 'Telegram',
    required: ['og:title'],
    recommended: ['og:description', 'og:image', 'og:site_name'],
    image: {
      tag: 'og:image',
      reachable: true
    }
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    required: ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'],
    recommended: ['twitter:site'],
    fallbacks: {
      'twitter:title': 'og:title',
      'twitter:description': 'og:description',
      'twitter:image': 'og:image'
    },
    image: {
      tag: 'twitter:image',
      fallbackTag: 'og:image',
      reachable: true,
      minWidth: 144,
      minHeight: 144,
      recommendedWidth: 1200,
      recommendedHeight: 628
    }
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    required: ['og:title', 'og:type', 'og:image', 'og:url', 'og:description'],
    recommended: ['og:site_name'],
    image: {
      tag: 'og:image',
      reachable: true,
      minWidth: 200,
      minHeight: 200,
      recommendedWidth: 1200,
      recommendedHeight: 627
    }
  }
];

export function getProfile(id: string): Profile | null {
  return PROFILES.find((p) => p.id === id) ?? null;
}
