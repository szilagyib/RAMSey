import { useAuth } from '../contexts/auth';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-50">
        <p className="text-sm text-surface-400">Loading...</p>
      </div>
    );
  }
  return <>{children}</>;
}
