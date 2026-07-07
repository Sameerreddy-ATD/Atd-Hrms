// ---------------------------------------------------------------------------
// Mock auth context.
//
// ⚠️ DEMO MODE ONLY
// - Persists the current mock user in `localStorage`. Replace with an
//   HTTP-only cookie session from the backend before production.
// - Frontend route guards below MUST be paired with backend RBAC. Never
//   rely on client checks for security.
// ---------------------------------------------------------------------------

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Role, User } from "@/mock/types";
import { authApi } from "@/services/api";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  loginAsRole: (role: Role) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user } = await authApi.login(email, password);
    setUser(user);
    return user;
  }, []);

  const loginAsRole = useCallback(async (role: Role) => {
    const { user } = await authApi.loginAsRole(role);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(() => {
    void authApi.logout().finally(() => setUser(null));
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, loginAsRole, logout }),
    [user, loading, login, loginAsRole, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useRequireAuth() {
  const { user, loading } = useAuth();
  return { user, loading, isAuthenticated: !!user };
}
