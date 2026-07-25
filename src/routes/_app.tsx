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
import { faceApi } from "@/services/api";
import { moduleAccessApi } from "@/services/api";
import { menuForRole, moduleForRoute } from "@/lib/menu";
import type { ModuleKey } from "@/types/domain";
import { Button } from "@/components/ui/button";

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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const userId = user?.id;
  const userRole = user?.role;

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
    const timer = window.setInterval(() => void refreshFacePolicy(), 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
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
        if (active) setAllowedModules([]);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  if (loading || !user || user.mustChangePassword) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-3 py-[env(safe-area-inset-top)] sm:px-4">
        <LoadingState
          label="Preparing your workspace"
          showBrandStory
          className="min-h-screen min-h-[100dvh]"
        />
      </div>
    );
  }

  if (faceRequired === null) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-4 py-[env(safe-area-inset-top)]">
        <LoadingState
          label={facePolicyError ? "Security policy unavailable" : "Checking security policy"}
          showBrandStory
          className="min-h-0"
        />
        {facePolicyError && (
          <div className="max-w-md space-y-3 text-center">
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
    return <FaceEnrollmentGate />;
  }

  if (allowedModules === null) {
    return <LoadingState label="Loading module access" className="min-h-screen min-h-[100dvh]" />;
  }

  const activeModule = moduleForRoute(pathname);
  const moduleBlocked = Array.isArray(allowedModules) && !allowedModules.includes(activeModule);
  const fallbackRoute = user
    ? menuForRole(user.role, { allowedModules: allowedModules ?? undefined })
        .flatMap((group) => group.items)
        .at(0)?.to
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
      <SidebarInset className="flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-muted/35 dark:bg-background">
        <AppHeader />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex flex-1 flex-col overflow-y-auto overscroll-y-contain p-0 pb-[env(safe-area-inset-bottom)] outline-none sm:p-3 lg:p-4"
        >
          <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden bg-background p-4 text-card-foreground sm:rounded-xl sm:border sm:border-border/80 sm:p-5 sm:shadow-sm lg:p-6">
            {moduleBlocked ? (
              <div className="m-auto flex max-w-md flex-col items-center px-4 py-12 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
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
                <Outlet />
              </>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
