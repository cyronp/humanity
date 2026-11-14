import { CircleCheck, Rocket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BLUE_BUTTON } from "./ServiceRow.tsx"

export function ReadyStep({ onStart }: { readonly onStart: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <CircleCheck className="size-16 text-blue-600" strokeWidth={1.5} aria-hidden="true" />
      <h2 className="text-2xl font-semibold tracking-tight">You're all set!</h2>
      <Button size="lg" className={BLUE_BUTTON} onClick={onStart} autoFocus>
        <Rocket />
        Start building
      </Button>
    </div>
  )
}
