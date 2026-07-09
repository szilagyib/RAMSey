import { useState } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { api } from '../services/api';
import { useAuth } from '../contexts/auth';

export function ShareRedeemPage() {
  const { token } = useParams<{ token: string }>();
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-50">
        <p className="text-sm text-surface-400">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/login?redirect=/share/${token}`} replace />;
  }

  async function handleAccept() {
    if (!token) return;
    setAccepting(true);
    setError('');
    try {
      await api.shares.redeemShareLink(token);
      setAccepted(true);
      setTimeout(() => navigate('/'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-surface-200 bg-white dark:bg-surface-100 p-8 shadow-sm text-center">
        <img src="/favicon.svg" alt="RAMSey" className="mx-auto mb-4 h-12 w-12" />
        <h2 className="mb-2 text-xl font-semibold text-surface-800">You&apos;ve been invited</h2>
        <p className="mb-6 text-sm text-surface-500">
          You&apos;ve been invited to collaborate on a RAMSey project.
        </p>
        {accepted ? (
          <p className="text-sm text-green-600">
            Invitation accepted! Redirecting to dashboard...
          </p>
        ) : (
          <>
            {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
            <Button onClick={handleAccept} disabled={accepting} className="w-full">
              {accepting ? 'Accepting...' : 'Accept Invitation'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
