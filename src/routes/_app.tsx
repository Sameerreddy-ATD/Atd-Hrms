import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
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
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0 bg-gradient-to-tr from-[#f3f7ff] via-[#f8faff] to-[#f4f7fe] dark:from-zinc-950 dark:via-zinc-900/90 dark:to-slate-950 flex flex-col h-screen overflow-hidden relative">
        {/* Decorative glassmorphic background blobs */}
        <div className="absolute top-[-20%] left-[-10%] w-[55%] h-[55%] bg-blue-400/8 dark:bg-blue-600/10 rounded-full blur-[120px] pointer-events-none z-0" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[55%] h-[55%] bg-indigo-400/8 dark:bg-purple-600/5 rounded-full blur-[100px] pointer-events-none z-0" />

        <AppHeader />
        <main className="flex-1 bg-transparent p-2 sm:p-4 lg:p-6 overflow-y-auto flex flex-col z-10">
          <div className="bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl text-card-foreground rounded-xl sm:rounded-2xl border border-white/20 dark:border-zinc-800/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.03)] p-3 sm:p-6 flex-1 flex flex-col">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
