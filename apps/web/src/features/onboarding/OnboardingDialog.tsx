import { ArrowLeft, ArrowRight } from "lucide-react"
import { useCallback, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Confetti, prefersReducedMotion } from "./Confetti.tsx"
import { ConnectStep } from "./ConnectStep.tsx"
import { closeOnboarding, neighbourStep, openOnboarding, useOnboarding } from "./onboarding.ts"
import { OnboardingStepper } from "./OnboardingStepper.tsx"
import { ReadyStep } from "./ReadyStep.tsx"
import { RepositoriesStep } from "./RepositoriesStep.tsx"
import { WelcomeStep } from "./WelcomeStep.tsx"

export function OnboardingDialog() {
  const { open, step } = useOnboarding()
  const [celebrating, setCelebrating] = useState(false)
  const stopCelebrating = useCallback(() => setCelebrating(false), [])
  const previous = neighbourStep(step, -1)
  const next = neighbourStep(step, 1)
  const middle = previous !== undefined && next !== undefined

  const finish = () => {
    if (!prefersReducedMotion()) setCelebrating(true)
    closeOnboarding()
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeOnboarding()
        }}
      >
        <DialogContent className="flex h-[44rem] max-h-[min(90svh,var(--dialog-max-height))] flex-col gap-0 p-0 sm:max-w-4xl">
          <DialogTitle className="sr-only">Welcome to Humanity</DialogTitle>
          <DialogDescription className="sr-only">
            Connect your agent and your repositories, then start building.
          </DialogDescription>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-10 pb-4">
            <div className="m-auto flex w-full max-w-2xl justify-center">
              {step === "welcome" && <WelcomeStep onStart={() => openOnboarding("connect")} />}
              {step === "connect" && <ConnectStep />}
              {step === "repositories" && <RepositoriesStep />}
              {step === "ready" && <ReadyStep onStart={finish} />}
            </div>
          </div>

          <footer className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4 py-1">
            <div>
              {previous !== undefined && (
                <Button variant="ghost" onClick={() => openOnboarding(previous)}>
                  <ArrowLeft />
                  Back
                </Button>
              )}
            </div>
            <OnboardingStepper current={step} onSelect={openOnboarding} />
            <div className="flex justify-end">
              {middle && (
                <Button onClick={() => openOnboarding(next)}>
                  Continue
                  <ArrowRight />
                </Button>
              )}
            </div>
          </footer>
        </DialogContent>
      </Dialog>
      {celebrating && <Confetti onDone={stopCelebrating} />}
    </>
  )
}
