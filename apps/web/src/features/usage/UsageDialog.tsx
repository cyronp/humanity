import { ChartColumn } from "lucide-react"
import { lazy, Suspense } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { closeUsage, useUsageOpen } from "./usage.ts"

const UsagePage = lazy(() => import("./UsagePage.tsx"))

export function UsageDialog() {
  const open = useUsageOpen()
  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeUsage()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChartColumn className="size-4" />
            Usage
          </DialogTitle>
          <DialogDescription className="sr-only">
            Tokens, turns and cost of every thread, over time.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <Suspense
            fallback={
              <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
                <Spinner /> Loading…
              </div>
            }
          >
            <UsagePage />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  )
}
