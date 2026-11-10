/**
 * The first-run guide. Whether it was finished is a per-browser convenience,
 * so it lives in localStorage; if storage is unavailable the guide simply
 * shows again, and it can always be reopened from the header.
 */

const STORAGE_KEY = "humanity.onboarding.completed"

export const ONBOARDING_STEPS = ["welcome", "how-it-works", "connect", "ready"] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

export const STEP_LABELS: Record<OnboardingStep, string> = {
  welcome: "Welcome",
  "how-it-works": "How it connects",
  connect: "Your Claude account",
  ready: "Ready",
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
  } catch {
    // No storage: the guide shows again next time, which is harmless.
  }
}
