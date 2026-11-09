import type { Cause } from "effect"
import { AsyncResult } from "effect/reactivity"
import type { ReactNode } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Skeleton } from "@/components/ui/skeleton"
import { describeCause } from "@/lib/errors"

/**
 * Renders the three states of a query the same way everywhere: skeleton while
 * loading, a visible error on failure, `children` on success. A refresh keeps
 * the previous value on screen instead of flashing the skeleton.
 */
export function AsyncView<A, E>({
  result,
  errorTitle,
  loading,
  children,
}: {
  readonly result: AsyncResult.AsyncResult<A, E>
  readonly errorTitle: string
  readonly loading?: ReactNode
  readonly children: (value: A) => ReactNode
}) {
  return AsyncResult.match(result, {
    onInitial: () => loading ?? <Skeleton className="h-20 w-full" aria-busy="true" />,
    onFailure: (failure) => (
      <ErrorNote
        title={errorTitle}
        message={describeCause(failure.cause as Cause.Cause<unknown>)}
      />
    ),
    onSuccess: (success) => children(success.value),
  })
}
