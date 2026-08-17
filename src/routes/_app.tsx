import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [faceRequired, setFaceRequired] = useState<boolean | null>(null);
  const [facePolicyError, setFacePolicyError] = useState("");
  const [allowedModules, setAllowedModules] = useState<ModuleKey[] | null | undefined>(null);
  const [pageEnter, setPageEnter] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const userId = user?.id;
  const userRole = user?.role;
  const employeeId = user?.employeeId;

  useEffect(() => {
    setPageEnter(false);
    const frame = window.requestAnimationFrame(() => setPageEnter(true));
    // Drop the enter class after the animation so transform does not keep
    // acting as a containing block for position:fixed UI (e.g. Profile save).
    const clear = window.setTimeout(() => setPageEnter(false), 320);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(clear);
    };
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
      <div className="aw-scroll-page">
        <LoadingState
          label={t("pages.loading.workspace")}
          showBrandStory
          className="min-h-full"
        />
      </div>
    );
  }

  if (faceRequired === null) {
    return (
      <div className="aw-scroll-page flex flex-col items-center justify-center gap-4 px-4 py-[env(safe-area-inset-top)]">
        <LoadingState
          label={
            facePolicyError ? t("pages.loading.securityUnavailable") : t("pages.loading.security")
          }
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
              {t("pages.shell.retrySecurity")}
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
      <div className="aw-scroll-page">
        <LoadingState
          label={t("pages.loading.moduleAccess")}
          showBrandStory
          className="min-h-full"
        />
      </div>
    );
  }

  const activeModule = moduleForRoute(pathname);
  const moduleBlocked =
    user.role !== "developer_admin" &&
    Array.isArray(allowedModules) &&
    !allowedModules.includes(activeModule);
  const fallbackRoute = user
    ? menuForRole(user.role, {
        allowedModules: allowedModules ?? undefined,
        hasEmployeeId: Boolean(user.employeeId),
        attendanceRequired: user.attendanceRequired !== false,
      }).flatMap((group) => group.items)[0]?.to
    : undefined;

  return (
      <SidebarProvider className="h-dvh max-h-dvh">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {t("pages.shell.skipToMain")}
      </a>
      <AppSidebar />
      <PermissionSetup />
      <SidebarInset className="aw-shell-canvas flex h-dvh max-h-dvh min-h-0 min-w-0 flex-col overflow-hidden bg-muted/35 dark:bg-background">
        <AppHeader />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain p-0 pb-[max(1.25rem,var(--atd-sab))] pl-[var(--atd-sal)] pr-[var(--atd-sar)] outline-none sm:p-3 sm:pb-[max(0.75rem,var(--atd-sab))] lg:p-4"
        >
          <div
            className={cn(
              "min-h-full min-w-0 max-w-full overflow-x-hidden bg-background/95 p-4 pb-6 text-card-foreground sm:rounded-xl sm:border sm:border-border/80 sm:bg-background sm:p-5 sm:pb-5 sm:shadow-sm lg:p-6",
              pageEnter && "aw-page-enter",
            )}
          >
            {moduleBlocked ? (
              <div className="m-auto flex max-w-md flex-col items-center px-4 py-12 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
                  <ShieldX className="h-6 w-6" />
                </span>
                <h1 className="mt-4 text-xl font-semibold">{t("pages.shell.moduleDisabled")}</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("pages.shell.moduleDisabledHelp")}
                </p>
                {fallbackRoute && fallbackRoute !== pathname && (
                  <Button asChild className="mt-5 w-full sm:w-auto">
                    <Link to={fallbackRoute}>{t("pages.shell.openWorkspace")}</Link>
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
