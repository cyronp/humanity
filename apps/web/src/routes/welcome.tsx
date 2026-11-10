import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, ArrowRight, FolderPlus } from "lucide-react"
import type { ComponentType } from "react"
import { Button } from "@/components/ui/button"
import { ConnectStep } from "@/features/onboarding/ConnectStep"
import { HowItConnectsStep } from "@/features/onboarding/HowItConnectsStep"
import {
  completeOnboarding,
  neighbourStep,
  type OnboardingStep,
  parseStep,
} from "@/features/onboarding/onboarding"
import { OnboardingStepper } from "@/features/onboarding/OnboardingStepper"
import { ReadyStep } from "@/features/onboarding/ReadyStep"
import { WelcomeStep } from "@/features/onboarding/WelcomeStep"

export const Route = createFileRoute("/welcome")({
  validateSearch: (search: Record<string, unknown>): { step?: OnboardingStep } => {
    const step = parseStep(search["step"])
    return step === undefined ? {} : { step }
  },
  component: WelcomePage,
})

const STEP_VIEWS: Record<OnboardingStep, ComponentType> = {
  welcome: WelcomeStep,
  "how-it-works": HowItConnectsStep,
  connect: ConnectStep,
  ready: ReadyStep,
}

function WelcomePage() {
  const { step = "welcome" } = Route.useSearch()
  const navigate = useNavigate()
  const previous = neighbourStep(step, -1)
  const next = neighbourStep(step, 1)
  const StepView = STEP_VIEWS[step]

  const finish = () => {
    completeOnboarding()
    void navigate({ to: "/" })
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex items-end justify-between gap-6">
        <div className="flex-1">
          <OnboardingStepper current={step} />
        </div>
        <Button variant="link" size="sm" className="text-muted-foreground" onClick={finish}>
          Skip setup
        </Button>
      </div>

      <div className="flex-1">
        <StepView />
      </div>

      <footer className="flex items-center justify-between gap-3 border-t pt-5">
        {previous === undefined ? (
          <span />
        ) : (
          <Button variant="ghost" asChild>
            <Link to="/welcome" search={{ step: previous }}>
              <ArrowLeft />
              Back
            </Link>
          </Button>
        )}
        {next === undefined ? (
          <Button onClick={finish}>
            <FolderPlus />
            Add your first project
          </Button>
        ) : (
          <Button asChild>
            <Link to="/welcome" search={{ step: next }}>
              {step === "welcome" ? "Get started" : "Continue"}
              <ArrowRight />
            </Link>
          </Button>
        )}
      </footer>
    </main>
  )
}
