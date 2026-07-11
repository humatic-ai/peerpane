/**
 * Production i18n uses the same JSON catalogs as development so the in-app
 * language switcher can override Chrome's UI locale at runtime.
 */
import type { DevLocale, MessageKey } from './type';
import { defaultLocale, getMessageFromLocale } from './getMessageFromLocale';

type I18nValue = {
  message: string;
  placeholders?: Record<string, { content?: string; example?: string }>;
};

function translate(key: MessageKey, substitutions?: string | string[]) {
  const locale = (t.devLocale || defaultLocale) as DevLocale;
  const catalog = getMessageFromLocale(locale);
  const value = catalog[key] as I18nValue | undefined;
  if (!value?.message) {
    return key;
  }
  let message = value.message;
  if (value.placeholders) {
    Object.entries(value.placeholders).forEach(([placeholderKey, { content }]) => {
      if (!content) return;
      message = message.replace(new RegExp(`\\$${placeholderKey}\\$`, 'gi'), content);
    });
  }
  if (!substitutions) {
    return message;
  }
  if (Array.isArray(substitutions)) {
    return substitutions.reduce((acc, cur, idx) => acc.replace(`$${idx + 1}`, cur), message);
  }
  return message.replace(/\$(\d+)/, substitutions);
}

function removePlaceholder(message: string) {
  return message.replace(/\$\d+/g, '');
}

export const t = (...args: Parameters<typeof translate>) => {
  return removePlaceholder(translate(...args));
};

t.devLocale = defaultLocale as DevLocale;

export function setActiveLocale(locale: DevLocale) {
  t.devLocale = locale;
}
