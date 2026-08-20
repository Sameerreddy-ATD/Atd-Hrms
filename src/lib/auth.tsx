// ---------------------------------------------------------------------------
// Cookie-backed authentication context.
//
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
import type { Role, User } from "@/types/domain";
import {
  authApi,
  keepSessionAlive,
  MaintenanceError,
  warmAuthenticatedWorkspace,
} from "@/services/api";
import { isMaintenanceActive } from "@/lib/maintenance";
import { isNativeApp, markNativeLoginGrace } from "@/lib/native-app";

const SESSION_USER_KEY = "atd.session.user";
/** Access cookies last 15 minutes; renew a few minutes early while the app is open. */
const SESSION_KEEPALIVE_MS = 12 * 60 * 1000;

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
  login: (email: string, password: string, portal?: "employee" | "driver") => Promise<User>;
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
    // Paint identity early, but keep loading=true until /auth/restore finishes.
    // Warming APIs or notification hydrate before restore races the refresh
    // cookie and was forcing a login screen on every native cold start.
    if (cachedUser) {
      setUser(cachedUser);
    }

    let cancelled = false;
    authApi
      .restore()
      .then(({ user: restored }) => {
        if (cancelled) return;
        setUser(restored);
        writeSessionUser(restored);
        void warmAuthenticatedWorkspace(restored);
      })
      .catch((err) => {
        if (cancelled) return;
        // Maintenance is not an auth failure — keep cached identity / cookies.
        if (err instanceof MaintenanceError || isMaintenanceActive()) return;
        setUser(null);
        writeSessionUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the access cookie warm while the app is open so a quiet period or a
  // frontend deploy reload does not wipe the refresh cookie and force /login.
  useEffect(() => {
    if (!user) return;

    const renew = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (isMaintenanceActive()) return;
      void keepSessionAlive();
    };

    // Restore/login just minted cookies — do not immediately POST /auth/refresh.
    const timer = window.setInterval(renew, SESSION_KEEPALIVE_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") renew();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", renew);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", renew);
    };
  }, [user]);

  const login = useCallback(async (email: string, password: string, portal?: "employee" | "driver") => {
    const { user } = await authApi.login(email, password, portal);
    if (isNativeApp()) markNativeLoginGrace();
    setUser(user);
    writeSessionUser(user);
    void warmAuthenticatedWorkspace(user);
    return user;
  }, []);

  const loginAsRole = useCallback(async (role: Role) => {
    const { user } = await authApi.loginAsRole(role);
    if (isNativeApp()) markNativeLoginGrace();
    setUser(user);
    writeSessionUser(user);
    return user;
  }, []);

  const changePassword = useCallback(async (oldPassword: string, nextPassword: string) => {
    const { user } = await authApi.changePassword(oldPassword, nextPassword);
    if (isNativeApp()) markNativeLoginGrace();
    setUser(user);
    writeSessionUser(user);
    void warmAuthenticatedWorkspace(user);
    return user;
  }, []);

  const updateCurrentUser = useCallback((nextUser: User) => {
    setUser(nextUser);
    writeSessionUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    writeSessionUser(null);
    setUser(null);
    void import("@/lib/offline-punch-queue").then(({ clearPunchTicket }) => clearPunchTicket());
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
