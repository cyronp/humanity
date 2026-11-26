import { useAtomValue } from "@effect/atom-react"
import { Atom } from "effect/reactivity"
import { registry } from "@/lib/registry"

const STORAGE_KEY = "humanity.onboarding.completed"

const DEBUG_PARAM = "onboarding"

export const ONBOARDING_STEPS = ["welcome", "connect", "repositories", "ready"] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

export const STEP_LABELS: Record<OnboardingStep, string> = {
  welcome: "Welcome",
  connect: "Connect your agent",
  repositories: "Source Control",
  ready: "All set",
}

export const parseStep = (value: unknown): OnboardingStep | undefined =>
  ONBOARDING_STEPS.find((step) => step === value)

export const stepIndex = (step: OnboardingStep): number => ONBOARDING_STEPS.indexOf(step)

export const neighbourStep = (step: OnboardingStep, delta: 1 | -1): OnboardingStep | undefined =>
  ONBOARDING_STEPS[stepIndex(step) + delta]

export const hasCompletedOnboarding = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}

export const completeOnboarding = (): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, new Date().toISOString())
  } catch {}
}

interface OnboardingState {
  readonly open: boolean
  readonly step: OnboardingStep
}

const debugParam = (): string | null => {
  try {
    return new URLSearchParams(window.location.search).get(DEBUG_PARAM)
  } catch {
    return null
  }
}

const initialState = (): OnboardingState => {
  const debug = debugParam()
  if (debug === "reset") {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {}
  }
  if (debug !== null) return { open: true, step: parseStep(debug) ?? "welcome" }
  return { open: !hasCompletedOnboarding(), step: "welcome" }
}

const stateAtom = Atom.make(initialState()).pipe(Atom.keepAlive)

export const openOnboarding = (step: OnboardingStep = "welcome"): void =>
  registry.set(stateAtom, { open: true, step })

export const closeOnboarding = (): void => {
  completeOnboarding()
  registry.update(stateAtom, (state) => ({ ...state, open: false }))
}

export const useOnboarding = (): OnboardingState => useAtomValue(stateAtom)
