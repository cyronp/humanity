import { createRootRoute, Link, Outlet } from "@tanstack/react-router"
import { CircleHelp } from "lucide-react"
import { ThemeToggle } from "@/components/ThemeToggle"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ClaudeStatusBadge } from "@/features/claude/ClaudeStatusBadge"

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => (
    <main className="p-8 text-sm text-muted-foreground">
      This page does not exist.{" "}
      <Link to="/" className="underline">
        Back to projects
      </Link>
    </main>
  ),
})

function RootLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="font-semibold tracking-tight">Humanity</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            human in the loop, not AI in the loop
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <ClaudeStatusBadge />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" asChild>
                <Link to="/welcome" aria-label="How Humanity works">
                  <CircleHelp />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>How Humanity works</TooltipContent>
          </Tooltip>
          <ThemeToggle />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
}
