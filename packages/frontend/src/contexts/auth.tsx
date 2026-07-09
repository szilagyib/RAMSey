import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../services/api';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  image?: string;
  emailVerified?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isGuest: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const GUEST_KEY = 'ramsey_guest_id';

function getOrCreateGuestUser(): AuthUser {
  let guestId = localStorage.getItem(GUEST_KEY);
  if (!guestId) {
    guestId = `local:${crypto.randomUUID()}`;
    localStorage.setItem(GUEST_KEY, guestId);
  }
  return { id: guestId, name: 'Guest', email: '' };
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.auth.me()
      .then((res) => setUser(res.data))
      .catch(() => setUser(getOrCreateGuestUser()))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const handler = () => setUser(getOrCreateGuestUser());
    window.addEventListener('ramsey:unauthorized', handler);
    return () => window.removeEventListener('ramsey:unauthorized', handler);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.auth.login({ email, password });
    setUser(res.data);
  }, []);

  const logout = useCallback(async () => {
    if (!user?.id.startsWith('local:')) {
      await api.auth.logout();
    }
    setUser(getOrCreateGuestUser());
  }, [user]);

  const isGuest = useMemo(() => Boolean(user?.id.startsWith('local:')), [user]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, isGuest, login, logout }),
    [user, isLoading, isGuest, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
