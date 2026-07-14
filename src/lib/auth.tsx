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

const SESSION_USER_KEY = "atd.session.user";

function writeSessionUser(user: User | null) {
  if (typeof window === "undefined") return;
  if (!user) {
    window.sessionStorage.removeItem(SESSION_USER_KEY);
    return;
  }
  window.sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  loginAsRole: (role: Role) => Promise<User>;
  changePassword: (oldPassword: string, nextPassword: string) => Promise<User>;
  updateCurrentUser: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Keep SSR and the first browser render identical; the cookie session is loaded after hydration.
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi
      .me()
      .then(({ user }) => {
        setUser(user);
        writeSessionUser(user);
      })
      .catch(() => {
        setUser(null);
        writeSessionUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user } = await authApi.login(email, password);
    setUser(user);
    writeSessionUser(user);
    return user;
  }, []);

  const loginAsRole = useCallback(async (role: Role) => {
    const { user } = await authApi.loginAsRole(role);
    setUser(user);
    writeSessionUser(user);
    return user;
  }, []);

  const changePassword = useCallback(async (oldPassword: string, nextPassword: string) => {
    const { user } = await authApi.changePassword(oldPassword, nextPassword);
    setUser(user);
    writeSessionUser(user);
    return user;
  }, []);

  const updateCurrentUser = useCallback((nextUser: User) => {
    setUser(nextUser);
    writeSessionUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    writeSessionUser(null);
    setUser(null);
    void authApi.logout();
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, loginAsRole, changePassword, updateCurrentUser, logout }),
    [user, loading, login, loginAsRole, changePassword, updateCurrentUser, logout],
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
