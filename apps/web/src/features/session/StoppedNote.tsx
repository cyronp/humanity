import type { PlanUsage } from "@humanity/contracts"
import { ArrowLeftRight, CircleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { hitUsageLimit } from "./usage.ts"

/** Why the agent stopped, with a way to carry on with another model, provider or account. */
export function StoppedNote({
  error,
  plan,
  onSwitch,
}: {
  readonly error: string
  readonly plan: PlanUsage | null
  /** Opens the model picker; left out when the thread takes no more messages. */
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
