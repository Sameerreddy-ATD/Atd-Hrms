import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldX } from "lucide-react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { PermissionSetup } from "@/components/layout/PermissionSetup";
import { LoadingState } from "@/components/common/LoadingState";
import { useAuth } from "@/lib/auth";
import { FaceEnrollmentGate } from "@/components/face/FaceEnrollmentGate";
import { PwaInstallBanner } from "@/components/layout/PwaInstallBanner";
import { faceApi } from "@/services/api";
import { moduleAccessApi } from "@/services/api";
import { menuForRole, moduleForRoute } from "@/lib/menu";
import type { ModuleKey } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// FRONTEND-ONLY GUARD
// Route guards below prevent unauthenticated users from seeing protected UI.
// This is a UX guard only; backend RBAC on every API endpoint is mandatory.

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [faceRequired, setFaceRequired] = useState<boolean | null>(null);
  const [facePolicyError, setFacePolicyError] = useState("");
  const [allowedModules, setAllowedModules] = useState<ModuleKey[] | null | undefined>(null);
  const [pageEnter, setPageEnter] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const userId = user?.id;
  const userRole = user?.role;

  useEffect(() => {
    setPageEnter(false);
    const frame = window.requestAnimationFrame(() => setPageEnter(true));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
    else if (!loading && user?.mustChangePassword) {
      navigate({ to: "/first-login", replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!userId || userRole === "developer_admin") {
      setFaceRequired(false);
      setFacePolicyError("");
      return;
    }
    let active = true;
    const refreshFacePolicy = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const status = await faceApi.status();
        if (active) {
          setFaceRequired(status.required);
          setFacePolicyError("");
        }
      } catch (err) {
        if (active) {
          setFaceRequired(null);
          setFacePolicyError((err as Error).message || "Unable to check face security policy");
        }
      }
    };
    void refreshFacePolicy();
    // Policy rarely changes — avoid 10s polling on mobile data.
    const timer = window.setInterval(() => void refreshFacePolicy(), 120_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshFacePolicy();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [userId, userRole]);

  useEffect(() => {
    if (!userId) {
      setAllowedModules(null);
      return;
    }
    let active = true;
    moduleAccessApi
      .mine()
      .then((result) => {
        if (active) setAllowedModules(result.modules);
      })
      .catch(() => {
        // Do not treat a transient failure as "no modules" (that locks the whole app).
        if (active) setAllowedModules(undefined);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  if (loading || !user || user.mustChangePassword) {
    return (
      <LoadingState
        label="Preparing your workspace"
        showBrandStory
        className="min-h-[100dvh]"
      />
    );
  }

  if (faceRequired === null) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-4 py-[env(safe-area-inset-top)]">
        <LoadingState
          label={facePolicyError ? "Security policy unavailable" : "Checking security policy"}
          showBrandStory
          className="min-h-0 flex-1"
        />
        {facePolicyError && (
          <div className="max-w-md space-y-3 pb-8 text-center">
            <p className="text-sm text-destructive">{facePolicyError}</p>
            <Button
              variant="outline"
              onClick={() => {
                setFacePolicyError("");
                void faceApi
                  .status()
                  .then((status) => {
                    setFaceRequired(status.required);
                    setFacePolicyError("");
                  })
                  .catch((err) => {
                    setFacePolicyError(
                      (err as Error).message || "Unable to check face security policy",
                    );
                  });
              }}
            >
              Retry security check
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (faceRequired) {
    return <FaceEnrollmentGate onUnlocked={() => setFaceRequired(false)} />;
  }

  if (allowedModules === null) {
    return (
      <LoadingState
        label="Loading module access"
        showBrandStory
        className="min-h-[100dvh]"
      />
    );
  }

  const activeModule = moduleForRoute(pathname);
  const moduleBlocked = Array.isArray(allowedModules) && !allowedModules.includes(activeModule);
  const fallbackRoute = user
    ? menuForRole(user.role, { allowedModules: allowedModules ?? undefined })
        .flatMap((group) => group.items)[0]?.to
    : undefined;

  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>
      <AppSidebar />
      <PermissionSetup />
      <SidebarInset className="aw-shell-canvas flex h-full max-h-full min-h-0 min-w-0 flex-col overflow-hidden bg-muted/35 dark:bg-background">
        <AppHeader />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain p-0 pb-[max(1.25rem,var(--atd-sab))] pl-[var(--atd-sal)] pr-[var(--atd-sar)] outline-none sm:p-3 sm:pb-[max(0.75rem,var(--atd-sab))] lg:p-4"
        >
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background/95 p-4 pb-6 text-card-foreground sm:rounded-xl sm:border sm:border-border/80 sm:bg-background sm:p-5 sm:pb-5 sm:shadow-sm lg:p-6",
              pageEnter && "aw-page-enter",
            )}
          >
            {moduleBlocked ? (
              <div className="m-auto flex max-w-md flex-col items-center px-4 py-12 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
                  <ShieldX className="h-6 w-6" />
                </span>
                <h1 className="mt-4 text-xl font-semibold">Module access is disabled</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Developer Admin has disabled this module for your role. Contact the system owner
                  if your work requires access.
                </p>
                {fallbackRoute && fallbackRoute !== pathname && (
                  <Button asChild className="mt-5 w-full sm:w-auto">
                    <Link to={fallbackRoute}>Open an available workspace</Link>
                  </Button>
                )}
              </div>
            ) : (
              <>
                <PwaInstallBanner className="mb-4" />
                <Outlet />
              </>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
