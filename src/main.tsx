import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { UpdateBanner } from './components/shared/UpdateBanner';
import { BackupNag } from './components/shared/BackupNag';
import { hydratePersistence } from './store/persistence';
import { applyStoredTheme } from './hooks/useTheme';
import { applyStoredAccent } from './hooks/useAccent';
import './i18n';
// Load the same Latin font cuts used by PDF export so the live HTML preview
// and the font picker show the real typefaces rather than system substitutes.
import '@fontsource/eb-garamond/latin-400.css';
import '@fontsource/eb-garamond/latin-600.css';
import '@fontsource/eb-garamond/latin-400-italic.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-400-italic.css';
import '@fontsource/lato/latin-400.css';
import '@fontsource/lato/latin-700.css';
import '@fontsource/lato/latin-400-italic.css';
import '@fontsource/carlito/latin-400.css';
import '@fontsource/carlito/latin-700.css';
import '@fontsource/carlito/latin-400-italic.css';
import '@fontsource/source-serif-4/latin-400.css';
import '@fontsource/source-serif-4/latin-700.css';
import '@fontsource/source-serif-4/latin-400-italic.css';
import '@fontsource/source-sans-3/latin-400.css';
import '@fontsource/source-sans-3/latin-700.css';
import '@fontsource/source-sans-3/latin-400-italic.css';
import './index.css';

// Apply saved theme + accent synchronously before paint so users don't see a flash.
applyStoredTheme();
applyStoredAccent();

// Start IDB hydration immediately. Components that need to wait can subscribe
// via `onHydrated`. Failure is non-fatal — the cache stays empty.
void hydratePersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <UpdateBanner />
    <BackupNag />
  </StrictMode>,
);
