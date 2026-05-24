import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { PwaUpdateToast } from './components/shared/PwaUpdateToast';
import { hydratePersistence } from './store/persistence';
import { applyStoredTheme } from './hooks/useTheme';
import './i18n';
import './index.css';

// Apply saved theme synchronously before paint so users don't see a flash.
applyStoredTheme();

// Start IDB hydration immediately. Components that need to wait can subscribe
// via `onHydrated`. Failure is non-fatal — the cache stays empty.
void hydratePersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <PwaUpdateToast />
  </StrictMode>,
);
