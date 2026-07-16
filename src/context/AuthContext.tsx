import { createContext, useContext, useState, ReactNode } from 'react';
import { authenticateWithCredentials } from '@/lib/fudo-api';

interface AuthState {
  token: string;
  clusterId: string;
  username: string;
  mode: 'normal' | 'support';
  dashCookie?: string;
}

interface AuthContextType {
  auth: AuthState | null;
  login: (username: string, password: string) => Promise<void>;
  loginWithCookie: (dashCookie: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = 'fudo_auth';

function loadSavedAuth(): AuthState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as AuthState) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(loadSavedAuth);

  async function login(username: string, password: string) {
    const data = await authenticateWithCredentials(username, password);
    const clusterId = String(data.clusters?.[0]?.id ?? '');
    const state: AuthState = { token: data.token, clusterId, username, mode: 'normal' };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setAuth(state);
  }

  function loginWithCookie(dashCookie: string) {
    const state: AuthState = { token: '', clusterId: '', username: 'soporte', mode: 'support', dashCookie };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setAuth(state);
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
  }

  return (
    <AuthContext.Provider value={{ auth, login, loginWithCookie, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
