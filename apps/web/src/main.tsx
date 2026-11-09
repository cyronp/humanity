import { RegistryProvider } from "@effect/atom-react"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { AuthGate } from "@/components/AuthGate"
import { TooltipProvider } from "@/components/ui/tooltip"
import { applyTheme } from "@/lib/theme"
import { captureTokenFromUrl } from "@/lib/token"
import "./index.css"
import { routeTree } from "./routeTree.gen"

captureTokenFromUrl()
applyTheme()

const router = createRouter({ routeTree, defaultPreload: false })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root element")

createRoot(root).render(
  <StrictMode>
    <RegistryProvider>
      <TooltipProvider>
        <AuthGate>
          <RouterProvider router={router} />
        </AuthGate>
      </TooltipProvider>
    </RegistryProvider>
  </StrictMode>,
)
