import { createRootRoute, Link, Outlet, useRouterState } from "@tanstack/react-router"
import type { CSSProperties } from "react"
import { ThemeToggle } from "@/components/ThemeToggle"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppHeaderHost } from "@/features/layout/AppHeader"
import { AppSidebar } from "@/features/sidebar/AppSidebar"

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => (
    <main className="p-8 text-sm text-muted-foreground">
      This page does not exist.{" "}
      <Link to="/" className="underline">
        Back to the start
      </Link>
    </main>
  ),
})

function RootLayout() {
  const onboarding = useRouterState({
    select: (state) => state.location.pathname.startsWith("/welcome"),
  })

  // The setup guide stands on its own, without the app around it.
  if (onboarding) {
    return (
      <div className="flex min-h-svh flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="font-semibold tracking-tight">Humanity</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              human in the loop, not AI in the loop
            </span>
          </Link>
          <ThemeToggle />
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    )
  }

  return (
    <SidebarProvider className="h-svh" style={{ "--sidebar-width": "18rem" } as CSSProperties}>
      <AppSidebar />
      <SidebarInset className="relative min-h-0 overflow-hidden">
        <AppHeaderHost>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <Outlet />
          </div>
        </AppHeaderHost>
      </SidebarInset>
    </SidebarProvider>
  )
}
