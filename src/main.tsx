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
