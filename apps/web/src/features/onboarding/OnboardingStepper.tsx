import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import { Check } from "lucide-react"
import { ONBOARDING_STEPS, type OnboardingStep, STEP_LABELS, stepIndex } from "./onboarding.ts"

/** Where you are in the guide. Every step stays reachable; nothing is gated. */
export function OnboardingStepper({ current }: { readonly current: OnboardingStep }) {
  const currentIndex = stepIndex(current)
  return (
    <nav aria-label="Setup steps">
      <ol className="flex items-center gap-2">
        {ONBOARDING_STEPS.map((step, index) => {
          const done = index < currentIndex
          const active = index === currentIndex
          return (
            <li key={step} className="flex flex-1 flex-col gap-2">
              <span
                className={cn(
                  "h-1 rounded-full bg-muted transition-colors",
                  (done || active) && "bg-primary",
                )}
                aria-hidden="true"
              />
              <Link
                to="/welcome"
                search={{ step }}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground",
                  active && "font-medium text-foreground",
                )}
              >
                {done && <Check className="size-3" aria-hidden="true" />}
                <span className="truncate">{STEP_LABELS[step]}</span>
              </Link>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
