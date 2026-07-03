import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ko, type MessageKey } from './ko';
import { en } from './en';

/**
 * 경량 i18n 골격(무의존). 한국어 기준 + 로케일별 부분 사전 병합, 누락 키는 ko 폴백.
 * 사용: const t = useT(); t('common.save'); t('greeting.welcome', { name });
 * 로케일 저장: localStorage 'mp_locale'. 신규 문자열은 ko.ts 에 키로 추가.
 */
export type Locale = 'ko' | 'en';
const DICTS: Record<Locale, Partial<Record<MessageKey, string>>> = { ko, en };
const STORAGE_KEY = 'mp_locale';

export type TFunc = (key: MessageKey, params?: Record<string, string | number>) => string;

function translate(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string {
  const raw = DICTS[locale]?.[key] ?? ko[key] ?? key;
  return params ? raw.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`)) : raw;
}

type Ctx = { locale: Locale; setLocale: (l: Locale) => void; t: TFunc };
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => (typeof localStorage !== 'undefined' && (localStorage.getItem(STORAGE_KEY) as Locale)) || 'ko');
  const setLocale = useCallback((l: Locale) => { setLocaleState(l); try { localStorage.setItem(STORAGE_KEY, l); } catch { /* noop */ } }, []);
  const t = useCallback<TFunc>((key, params) => translate(locale, key, params), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const c = useContext(I18nContext);
  if (!c) throw new Error('useI18n must be used within I18nProvider');
  return c;
}
/** 문자열만 필요할 때. */
export function useT(): TFunc {
  return useI18n().t;
}
