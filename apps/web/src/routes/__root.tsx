import { createRootRoute, Link, Outlet } from "@tanstack/react-router"
import type { CSSProperties } from "react"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppHeaderHost } from "@/features/layout/AppHeader"
import { OnboardingDialog } from "@/features/onboarding/OnboardingDialog"
import { AddRepositoryDialog } from "@/features/projects/AddRepositoryDialog"
import { SettingsDialog } from "@/features/settings/SettingsDialog"
import { AppSidebar } from "@/features/sidebar/AppSidebar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ResizeHandle } from "@/components/ResizeHandle"
import { useStoredWidth } from "@/lib/resize"

const SIDEBAR_DEFAULT_WIDTH = 320
const SIDEBAR_MIN_WIDTH = 240
const SIDEBAR_MAX_WIDTH = 520
/** The sidebar never takes more than this share of the window. */
const SIDEBAR_MAX_SHARE = 0.4

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
  const [sidebarWidth, setSidebarWidth] = useStoredWidth("humanity.sidebarWidth")
  const width = sidebarWidth ?? SIDEBAR_DEFAULT_WIDTH
  return (
    <SidebarProvider className="h-svh" style={{ "--sidebar-width": `${width}px` } as CSSProperties}>
      <AppSidebar
        resizeHandle={
          <ResizeHandle
            edge="end"
            label="Resize the sidebar"
            value={width}
            min={SIDEBAR_MIN_WIDTH}
            max={() =>
              Math.max(
                SIDEBAR_MIN_WIDTH,
                Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth * SIDEBAR_MAX_SHARE),
              )
            }
            measure={() => width}
            onResize={setSidebarWidth}
            onReset={() => setSidebarWidth(null)}
          />
        }
      />
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
