import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import es from './locales/es';

// Minimal i18n setup. Each locale is a single nested object that can be
// extended without changing call sites. Resume *content* is user-written and
// never translated; only app chrome strings flow through here.

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, es: { translation: es } },
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'resume-editor:locale',
      caches: ['localStorage'],
    },
  });

export default i18n;

export const SUPPORTED_LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
];
