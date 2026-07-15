import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { PermissionSetup } from "@/components/layout/PermissionSetup";
import { LoadingState } from "@/components/common/LoadingState";
import { useAuth } from "@/lib/auth";

// FRONTEND-ONLY GUARD
// Route guards below prevent unauthenticated users from seeing protected UI.
// This is a UX guard only; backend RBAC on every API endpoint is mandatory.

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
    else if (!loading && user?.mustChangePassword) {
      navigate({ to: "/first-login", replace: true });
    }
  }, [loading, user, navigate]);

  if (loading || !user || user.mustChangePassword) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <LoadingState label="Preparing your workspace" className="min-h-screen" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <PermissionSetup />
      <SidebarInset className="relative flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-gradient-to-tr from-[#f3f7ff] via-[#f8faff] to-[#f4f7fe] dark:from-zinc-950 dark:via-zinc-900/90 dark:to-slate-950">
        {/* Decorative glassmorphic background blobs */}
        <div className="absolute top-[-20%] left-[-10%] w-[55%] h-[55%] bg-blue-400/8 dark:bg-blue-600/10 rounded-full blur-[120px] pointer-events-none z-0" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[55%] h-[55%] bg-indigo-400/8 dark:bg-purple-600/5 rounded-full blur-[100px] pointer-events-none z-0" />

        <AppHeader />
        <main className="z-10 flex flex-1 flex-col overflow-y-auto bg-transparent p-0 sm:p-4 lg:p-6">
          <div className="flex min-w-0 flex-1 flex-col rounded-none border-0 border-white/20 bg-white/60 p-3 text-card-foreground shadow-[0_8px_32px_0_rgba(31,38,135,0.03)] backdrop-blur-xl dark:border-zinc-800/40 dark:bg-zinc-900/60 sm:rounded-xl sm:border sm:p-5 lg:rounded-2xl lg:p-6">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
