import { Suspense, lazy, type ComponentType } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/theme';
import { AuthProvider } from './contexts/auth';
import { ProtectedRoute } from './components/ProtectedRoute';

// Route-level code splitting: each page loads on demand, so the heavy editor
// stack (React Flow, elkjs, yjs, engine) isn't in the initial bundle for
// login/dashboard visitors.
//
// A tab opened before a deploy holds chunk hashes the new build removed, so
// navigating fails to fetch the module. Reloading picks up the fresh index.html
// and chunks.
//
// Only NETWORK failures qualify. An error thrown while a module evaluates is a
// real bug: reloading would hide it, cost the user their page, and still end at
// the error boundary — so those propagate untouched (and reach Sentry).
const CHUNK_LOAD_ERROR =
  /dynamically imported module|importing a module script failed|failed to fetch|error loading/i;

function isChunkLoadError(err: unknown): boolean {
  return CHUNK_LOAD_ERROR.test(err instanceof Error ? err.message : String(err));
}

/** sessionStorage throws when storage is blocked; never let that mask the error. */
function readReloadStamp(key: string): number | null {
  try {
    return Number(sessionStorage.getItem(key) ?? '0');
  } catch {
    return null;
  }
}

export function retryChunkLoad<T>(factory: () => Promise<T>): Promise<T> {
  return factory().catch((err: unknown) => {
    if (!isChunkLoadError(err)) throw err;

    // One reload per 10s: a chunk that is genuinely gone must not loop.
    const key = 'chunkReloadAt';
    const last = readReloadStamp(key);
    if (last === null || Date.now() - last <= 10_000) throw err;

    try {
      sessionStorage.setItem(key, String(Date.now()));
    } catch {
      throw err;
    }
    window.location.reload();
    return new Promise<T>(() => {}); // never resolves; the reload takes over
  });
}

function lazyRoute<T extends ComponentType<unknown>>(factory: () => Promise<{ default: T }>) {
  return lazy(() => retryChunkLoad(factory));
}

const DashboardPage = lazyRoute(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const ProjectPage = lazyRoute(() =>
  import('./pages/ProjectPage').then((m) => ({ default: m.ProjectPage })),
);
const EditorPage = lazyRoute(() =>
  import('./pages/EditorPage').then((m) => ({ default: m.EditorPage })),
);
const LoginPage = lazyRoute(() =>
  import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazyRoute(() =>
  import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const ForgotPasswordPage = lazyRoute(() =>
  import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazyRoute(() =>
  import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
const VerifyEmailPage = lazyRoute(() =>
  import('./pages/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage })),
);
const TeamsPage = lazyRoute(() =>
  import('./pages/TeamsPage').then((m) => ({ default: m.TeamsPage })),
);
const AccountPage = lazyRoute(() =>
  import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })),
);
const PrivacyPage = lazyRoute(() =>
  import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })),
);
const ShareRedeemPage = lazyRoute(() =>
  import('./pages/ShareRedeemPage').then((m) => ({ default: m.ShareRedeemPage })),
);

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50">
      <p className="text-sm text-surface-400">Loading…</p>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/share/:token" element={<ShareRedeemPage />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/teams"
                element={
                  <ProtectedRoute>
                    <TeamsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/account"
                element={
                  <ProtectedRoute>
                    <AccountPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:projectId"
                element={
                  <ProtectedRoute>
                    <ProjectPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:projectId/diagrams/:diagramId"
                element={
                  <ProtectedRoute>
                    <EditorPage />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
