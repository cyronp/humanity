import { CircleCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ReadyStep({ onStart }: { readonly onStart: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <CircleCheck className="size-16 text-brand" strokeWidth={1.5} aria-hidden="true" />
      <h2 className="text-2xl font-semibold tracking-tight">You're all set</h2>
      <Button variant="brand" size="lg" onClick={onStart} autoFocus>
        Start building
      </Button>
    </div>
  )
}
