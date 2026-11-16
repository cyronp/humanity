import { cn } from "cn"
import { ONBOARDING_STEPS, type OnboardingStep, STEP_LABELS, stepIndex } from "./onboarding.ts"

/** Where you are in the guide, as short lines. Every step stays reachable; nothing is gated. */
export function OnboardingStepper({
  current,
  onSelect,
}: {
  readonly current: OnboardingStep
  readonly onSelect: (step: OnboardingStep) => void
}) {
  const currentIndex = stepIndex(current)
  return (
    <nav aria-label="Setup steps">
      <ol className="flex items-center justify-center">
        {ONBOARDING_STEPS.map((step, index) => (
          <li key={step}>
            <button
              type="button"
              onClick={() => onSelect(step)}
              aria-label={STEP_LABELS[step]}
              aria-current={index === currentIndex ? "step" : undefined}
              className="group flex h-12 w-9 items-center justify-center rounded-md outline-none sm:w-12 focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {/* The line is thin; the button around it is the 48px target a finger needs. */}
              <span
                className={cn(
                  "h-1 w-7 rounded-full bg-muted-foreground/30 sm:w-9 transition-colors group-hover:bg-muted-foreground/60",
                  index === currentIndex && "bg-brand group-hover:bg-brand",
                )}
              />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
