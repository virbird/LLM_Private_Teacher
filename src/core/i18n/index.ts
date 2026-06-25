import { en } from './en';
import { zh } from './zh';

type LocaleMap = typeof en;

const locales: Record<string, LocaleMap> = { en, zh };
let currentLocale: string = 'en';

export function setLocale(locale: string): void {
  if (locales[locale]) {
    currentLocale = locale;
  }
}

export function getLocale(): string {
  return currentLocale;
}

/** Translate a key with optional interpolation: t('tokens', { in: '100', out: '50', pct: '10' }) */
export function t(key: keyof LocaleMap, params?: Record<string, string | number>): string {
  const map = locales[currentLocale] ?? en;
  let text = map[key] ?? en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}
