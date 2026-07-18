import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';
import pt from './locales/pt';

// Minimal i18n setup. Each locale is a single nested object that can be
// extended without changing call sites. Resume *content* is user-written and
// never translated; only app chrome strings flow through here.

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      pt: { translation: pt },
    },
    supportedLngs: ['en', 'es', 'fr', 'pt'],
    nonExplicitSupportedLngs: true,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'resume-editor:locale',
      caches: ['localStorage'],
    },
  });

// Keep <html lang> in sync with the active locale so screen readers, browser
// translation prompts, and hyphenation use the right language. i18next doesn't
// touch the DOM attribute on its own.
function syncDocumentLang(lng: string): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = (lng || 'en').split('-')[0];
  }
}
syncDocumentLang(i18n.language);
i18n.on('languageChanged', syncDocumentLang);

export default i18n;

export const SUPPORTED_LOCALES = [
  { value: 'en', label: 'English', beta: false },
  { value: 'es', label: 'Español', beta: false },
  { value: 'fr', label: 'Français', beta: true },
  { value: 'pt', label: 'Português (Brasil)', beta: true },
] as const;
