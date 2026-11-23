import { useAtomValue } from "@effect/atom-react"
import type { ProjectId, Skill } from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { Sparkles } from "lucide-react"
import { CommandGroup, CommandItem } from "@/components/ui/command"
import { Spinner } from "@/components/ui/spinner"
import { extensionsAtom } from "@/features/extensions/atoms"
import type { PaletteResultsProps } from "./registry.ts"

const SOURCE_LABEL: Record<Skill["source"], string | undefined> = {
  humanity: undefined,
  project: "repository",
  user: "yours",
}

export const skillMatches = (skill: Skill, query: string): boolean => {
  const needle = query.trim().toLowerCase()
  return (
    needle === "" ||
    [skill.name, skill.invocation, skill.description].some((text) =>
      text.toLowerCase().includes(needle),
    )
  )
}

export function SkillResults({
  projectId,
  onPick,
  query,
  close,
}: PaletteResultsProps & {
  readonly projectId: ProjectId
  readonly onPick: (skill: Skill) => void
}) {
  const result = useAtomValue(extensionsAtom(projectId))
  if (!AsyncResult.isSuccess(result)) {
    return (
      <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
        <Spinner /> Finding skills…
      </div>
    )
  }
  const skills = result.value.skills.filter((skill) => skillMatches(skill, query))
  return (
    <>
      {skills.length === 0 && (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">No skill matches.</p>
      )}
      {skills.length > 0 && (
        <CommandGroup heading="Skills">
          {skills.map((skill) => (
            <CommandItem
              key={`${skill.source}:${skill.location}:${skill.name}`}
              value={`skill ${skill.source} ${skill.location} ${skill.name}`}
              keywords={[skill.name, skill.invocation, skill.description]}
              onSelect={() => {
                close()
                onPick(skill)
              }}
              className="items-start gap-3 py-2"
            >
              <Sparkles className="mt-0.5 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{skill.name}</span>
                  {SOURCE_LABEL[skill.source] !== undefined && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {SOURCE_LABEL[skill.source]}
                    </span>
                  )}
                </span>
                {skill.description !== "" && (
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {skill.description}
                  </span>
                )}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </>
  )
}
