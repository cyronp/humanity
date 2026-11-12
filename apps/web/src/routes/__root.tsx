import { createRootRoute, Link, Outlet } from "@tanstack/react-router"
import type { CSSProperties } from "react"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppHeaderHost } from "@/features/layout/AppHeader"
import { OnboardingDialog } from "@/features/onboarding/OnboardingDialog"
import { AddRepositoryDialog } from "@/features/projects/AddRepositoryDialog"
import { SettingsDialog } from "@/features/settings/SettingsDialog"
import { AppSidebar } from "@/features/sidebar/AppSidebar"
import { ScrollArea } from "@/components/ui/scroll-area"

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
  return (
    <SidebarProvider className="h-svh" style={{ "--sidebar-width": "20rem" } as CSSProperties}>
      <AppSidebar />
      <SidebarInset className="relative min-h-0 overflow-hidden [--background:var(--chat)]">
        <AppHeaderHost>
          <ScrollArea
            className="min-h-0 flex-1"
            viewportClassName="[&>div]:flex! [&>div]:h-full [&>div]:flex-col"
          >
            <Outlet />
          </ScrollArea>
        </AppHeaderHost>
      </SidebarInset>
      <OnboardingDialog />
      <SettingsDialog />
      <AddRepositoryDialog />
    </SidebarProvider>
  )
}
