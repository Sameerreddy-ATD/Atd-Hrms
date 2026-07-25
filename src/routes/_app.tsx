import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { PermissionSetup } from "@/components/layout/PermissionSetup";
import { LoadingState } from "@/components/common/LoadingState";
import { useAuth } from "@/lib/auth";
import { FaceEnrollmentGate } from "@/components/face/FaceEnrollmentGate";
import { faceApi } from "@/services/api";

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
      return;
    }
    let active = true;
    const refreshFacePolicy = async () => {
      try {
        const status = await faceApi.status();
        if (active) setFaceRequired(status.required);
      } catch {
        if (active) setFaceRequired(null);
      }
    };
    void refreshFacePolicy();
    const timer = window.setInterval(() => void refreshFacePolicy(), 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [userId, userRole]);

  if (loading || !user || user.mustChangePassword) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-3 py-[env(safe-area-inset-top)] sm:px-4">
        <LoadingState label="Preparing your workspace" showBrandStory className="min-h-[100dvh]" />
      </div>
    );
  }

  if (faceRequired === null) {
    return (
      <LoadingState label="Checking security policy" showBrandStory className="min-h-[100dvh]" />
    );
  }

  if (faceRequired) {
    return <FaceEnrollmentGate />;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <PermissionSetup />
      <SidebarInset className="flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-muted/35 dark:bg-background">
        <AppHeader />
        <main className="flex flex-1 flex-col overflow-y-auto overscroll-y-contain p-0 pb-[env(safe-area-inset-bottom)] sm:p-3 lg:p-5">
          <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden bg-background p-3 text-card-foreground sm:rounded-lg sm:border sm:p-5 sm:shadow-sm lg:p-6">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
