import type { PlanUsage } from "@humanity/contracts"
import { ArrowLeftRight, CircleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { hitUsageLimit } from "./usage.ts"

export function StoppedNote({
  error,
  plan,
  onSwitch,
}: {
  readonly error: string
  readonly plan: PlanUsage | null
  readonly onSwitch?: (() => void) | undefined
}) {
  const limit = hitUsageLimit(error, plan, new Date())
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert />
      <AlertTitle>{limit ? "The agent hit a usage limit" : "The agent stopped"}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <span className="whitespace-pre-wrap">{error}</span>
        {onSwitch !== undefined && (
          <Button size="sm" variant={limit ? "default" : "outline"} onClick={onSwitch}>
            <ArrowLeftRight />
            Continue on another model
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
