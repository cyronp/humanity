import { useNavigate } from "@tanstack/react-router"
import { ArrowLeft, ArrowRight, FolderPlus } from "lucide-react"
import type { ComponentType } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { openAddRepository } from "@/features/projects/addRepository"
import { ConnectStep } from "./ConnectStep.tsx"
import {
  closeOnboarding,
  neighbourStep,
  type OnboardingStep,
  openOnboarding,
  useOnboarding,
} from "./onboarding.ts"
import { OnboardingStepper } from "./OnboardingStepper.tsx"
import { ReadyStep } from "./ReadyStep.tsx"
import { RepositoriesStep } from "./RepositoriesStep.tsx"
import { WelcomeStep } from "./WelcomeStep.tsx"

const STEP_VIEWS: Record<OnboardingStep, ComponentType> = {
  welcome: WelcomeStep,
  connect: ConnectStep,
  repositories: RepositoriesStep,
  ready: ReadyStep,
}

/** The setup guide, floating over the app. Closing it any way counts as having seen it. */
export function OnboardingDialog() {
  const { open, step } = useOnboarding()
  const navigate = useNavigate()
  const previous = neighbourStep(step, -1)
  const next = neighbourStep(step, 1)
  const StepView = STEP_VIEWS[step]

  const finish = () => {
    closeOnboarding()
    void navigate({ to: "/" })
    openAddRepository()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeOnboarding()
      }}
    >
      <DialogContent className="flex h-[90svh] flex-col gap-0 p-0 sm:max-w-none md:h-[70svh] md:w-[70vw]">
        <DialogTitle className="sr-only">Welcome to Humanity</DialogTitle>
        <DialogDescription className="sr-only">
          A short guide to how Humanity works and how to connect an account and your repositories.
        </DialogDescription>

        {/* Right padding leaves room for the close button. */}
        <div className="shrink-0 border-b py-4 pr-14 pl-4 sm:pl-6">
          <OnboardingStepper current={step} onSelect={openOnboarding} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto w-full max-w-4xl">
            <StepView />
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t px-4 py-3 sm:px-6">
          {previous === undefined ? (
            <span />
          ) : (
            <Button variant="ghost" onClick={() => openOnboarding(previous)}>
              <ArrowLeft />
              Back
            </Button>
          )}
          {next === undefined ? (
            <Button onClick={finish}>
              <FolderPlus />
              Add your first repository
            </Button>
          ) : (
            <Button onClick={() => openOnboarding(next)}>
              {step === "welcome" ? "Get started" : "Continue"}
              <ArrowRight />
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  )
}
