// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { t as t_dev_or_prod, setActiveLocale as setActiveLocale_impl } from './lib/i18n';
import type { t as t_dev } from './lib/i18n-dev';
import { defaultLocale } from './lib/getMessageFromLocale';
export type { DevLocale, MessageKey } from './lib/type';

export const t = t_dev_or_prod as unknown as typeof t_dev;
export const setActiveLocale = setActiveLocale_impl as (locale: import('./lib/type').DevLocale) => void;
export { defaultLocale };
