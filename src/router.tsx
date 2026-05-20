import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LandingPage } from './pages/Landing';

// Editor pulls in the largest editor surface (TipTap, dnd-kit, preview renderer).
// Keep the landing page light by lazy-loading the editor on first navigation.
const EditorPage = lazy(() =>
  import('./pages/Editor').then((m) => ({ default: m.EditorPage })),
);

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  {
    path: '/editor/:resumeId',
    element: (
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-sm text-ink-subtle">
            Loading editor…
          </div>
        }
      >
        <EditorPage />
      </Suspense>
    ),
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
