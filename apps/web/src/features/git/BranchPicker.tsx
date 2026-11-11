import { useAtomValue } from "@effect/atom-react"
import type { Branch, Project } from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { Cloud, GitBranch } from "lucide-react"
import { useState } from "react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { InputGroupButton } from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { describeCause } from "@/lib/errors"
import { formatTimeAgo, useNow } from "@/lib/elapsed"
import { branchesAtom } from "./atoms.ts"

/** Most recently committed first, like VS Code's branch picker. */
const byRecentCommit = (a: Branch, b: Branch) =>
  (Date.parse(b.committedAt) || 0) - (Date.parse(a.committedAt) || 0)

/**
 * Picks the branch the project's checkout switches to for a new thread: a
 * searchable popup listing local and remote branches with their last commit.
 */
export function BranchPicker({
  project,
  value,
  onChange,
  disabled = false,
}: {
  readonly project: Project
  readonly value: string
  readonly onChange: (name: string) => void
  readonly disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const branches = useAtomValue(branchesAtom(project.id))
  // Refreshed once a minute, so "x minutes ago" stays true while the popup is open.
  const now = useNow(60_000)

  const all = AsyncResult.isSuccess(branches) ? branches.value : []
  const local = all.filter((branch) => !branch.isRemote).toSorted(byRecentCommit)
  const remote = all.filter((branch) => branch.isRemote).toSorted(byRecentCommit)

  const choose = (name: string) => {
    onChange(name)
    setOpen(false)
  }

  const rows = (list: ReadonlyArray<Branch>) =>
    list.map((branch) => (
      <BranchRow
        key={branch.name}
        branch={branch}
        selected={branch.name === value}
        now={now}
        onSelect={() => choose(branch.name)}
      />
    ))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <InputGroupButton
          size="sm"
          className="max-w-52 text-muted-foreground hover:text-foreground"
          aria-label={`Work on branch ${value}`}
        >
          <GitBranch />
          <span className="truncate font-mono text-xs">{value}</span>
        </InputGroupButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[30rem] max-w-[calc(100vw-2rem)] p-0">
        <Command>
          <CommandInput placeholder="Select a branch to work on" />
          <CommandList className="max-h-96">
            {AsyncResult.isSuccess(branches) ? (
              <>
                <CommandEmpty>No branch matches.</CommandEmpty>
                {local.length > 0 && <CommandGroup heading="Branches">{rows(local)}</CommandGroup>}
                {local.length > 0 && remote.length > 0 && <CommandSeparator />}
                {remote.length > 0 && (
                  <CommandGroup heading="Remote branches">{rows(remote)}</CommandGroup>
                )}
              </>
            ) : AsyncResult.isFailure(branches) ? (
              <p className="px-3 py-6 text-center text-sm text-destructive">
                {describeCause(branches.cause)}
              </p>
            ) : (
              <div className="flex flex-col gap-2 p-2" aria-label="Loading branches">
                {[0, 1, 2].map((key) => (
                  <Skeleton key={key} className="h-10 w-full" />
                ))}
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Two lines, as in VS Code: the branch, how far it is from its upstream and
 * how long ago it last moved; then who made that commit, its hash and subject.
 */
function BranchRow({
  branch,
  selected,
  now,
  onSelect,
}: {
  readonly branch: Branch
  readonly selected: boolean
  readonly now: number
  readonly onSelect: () => void
}) {
  const Icon = branch.isRemote ? Cloud : GitBranch
  const tracked = branch.ahead > 0 || branch.behind > 0
  const ago = formatTimeAgo(branch.committedAt, now)
  return (
    <CommandItem
      value={branch.name}
      keywords={[branch.author, branch.subject, branch.commit]}
      onSelect={onSelect}
      data-checked={selected}
      className="items-start"
    >
      <Icon className="mt-0.5 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium">{branch.name}</span>
          {branch.isCurrent && (
            <span className="shrink-0 text-xs text-muted-foreground">(checked out)</span>
          )}
          {tracked && (
            <span
              className="shrink-0 text-xs text-muted-foreground tabular-nums"
              title={`${branch.behind} behind, ${branch.ahead} ahead of ${branch.upstream ?? "its upstream"}`}
            >
              {branch.behind}↓ {branch.ahead}↑
            </span>
          )}
          {ago !== "" && (
            <span className="shrink-0 text-xs text-muted-foreground">
              <span aria-hidden>• </span>
              <time dateTime={branch.committedAt}>{ago}</time>
            </span>
          )}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {branch.author} • <span className="font-mono">{branch.commit}</span> • {branch.subject}
        </span>
      </span>
    </CommandItem>
  )
}
