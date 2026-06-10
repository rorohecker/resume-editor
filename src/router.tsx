import { lazy, Suspense } from 'react';
// HashRouter so the app works the same from file://, GitHub Pages, a custom
// subpath, or a root domain. Static hosts don't need a SPA fallback rule and
// double-click-open-in-browser still works.
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom';
import { LandingPage } from './pages/Landing';
import { AppErrorBoundary } from './components/shared/AppErrorBoundary';

const EditorPage = lazy(() =>
  import('./pages/Editor').then((m) => ({ default: m.EditorPage })),
);

const ResumeViewPage = lazy(() =>
  import('./pages/ResumeView').then((m) => ({ default: m.ResumeViewPage })),
);

export const router = createHashRouter([
  {
    path: '/',
    element: (
      <AppErrorBoundary>
        <LandingPage />
      </AppErrorBoundary>
    ),
  },
  {
    path: '/editor/:resumeId',
    element: (
      <AppErrorBoundary>
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-ink-subtle">
              Loading editor…
            </div>
          }
        >
          <EditorPage />
        </Suspense>
      </AppErrorBoundary>
    ),
  },
  {
    path: '/view',
    element: (
      <AppErrorBoundary>
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-ink-subtle">
              Loading…
            </div>
          }
        >
          <ResumeViewPage />
        </Suspense>
      </AppErrorBoundary>
    ),
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

// Re-export so main.tsx can keep its existing import shape.
export { RouterProvider };
