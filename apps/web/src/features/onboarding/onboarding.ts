import { useSyncExternalStore } from "react"

/**
 * The first-run guide, shown as a popup over the app. Whether it was finished
 * is a per-browser convenience, so it lives in localStorage; if storage is
 * unavailable the guide simply shows again, and it can always be reopened from
 * the settings.
 */

const STORAGE_KEY = "humanity.onboarding.completed"

/**
 * Debugging aid: load any page with `?onboarding` to force the guide open,
 * `?onboarding=<step>` to open it at a step, or `?onboarding=reset` to forget
 * that it was finished and see it exactly as a first visit does.
 */
const DEBUG_PARAM = "onboarding"

export const ONBOARDING_STEPS = ["welcome", "connect", "repositories", "ready"] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

export const STEP_LABELS: Record<OnboardingStep, string> = {
  welcome: "Welcome",
  connect: "Connect",
  repositories: "Repositories",
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
    } catch {
      // No storage: nothing was remembered, so there is nothing to forget.
    }
  }
  if (debug !== null) return { open: true, step: parseStep(debug) ?? "welcome" }
  // First visit in this browser: show the guide before anything else.
  return { open: !hasCompletedOnboarding(), step: "welcome" }
}

let state = initialState()
const listeners = new Set<() => void>()

const setState = (next: OnboardingState): void => {
  state = next
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Opens the guide, or moves it to another step when it is already open. */
export const openOnboarding = (step: OnboardingStep = "welcome"): void =>
  setState({ open: true, step })

/** Closes the guide and remembers it was seen, so it does not open by itself again. */
export const closeOnboarding = (): void => {
  completeOnboarding()
  setState({ ...state, open: false })
}

export const useOnboarding = (): OnboardingState => useSyncExternalStore(subscribe, () => state)
