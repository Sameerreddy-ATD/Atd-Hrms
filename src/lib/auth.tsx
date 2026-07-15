// ---------------------------------------------------------------------------
// Cookie-backed authentication context.
//
// ⚠️ DEMO MODE ONLY
// Browser storage contains display-only user data for a fast first paint.
// Authentication remains in HTTP-only cookies and backend RBAC remains authoritative.
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
    window.localStorage.removeItem(SESSION_USER_KEY);
    return;
  }
  const serialized = JSON.stringify(user);
  window.sessionStorage.setItem(SESSION_USER_KEY, serialized);
  window.localStorage.setItem(SESSION_USER_KEY, serialized);
}

function readSessionUser() {
  if (typeof window === "undefined") return null;
  const serialized =
    window.sessionStorage.getItem(SESSION_USER_KEY) ??
    window.localStorage.getItem(SESSION_USER_KEY);
  if (!serialized) return null;
  try {
    return JSON.parse(serialized) as User;
  } catch {
    writeSessionUser(null);
    return null;
  }
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
    const cachedUser = readSessionUser();
    if (cachedUser) {
      setUser(cachedUser);
      setLoading(false);
    }

    authApi
      .restore()
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
