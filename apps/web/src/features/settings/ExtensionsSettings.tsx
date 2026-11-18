import { useAtomValue } from "@effect/atom-react"
import type { McpServer, ProjectId, Skill } from "@humanity/contracts"
import { useParams } from "@tanstack/react-router"
import { AsyncResult } from "effect/reactivity"
import type { ReactNode } from "react"
import { AsyncView } from "@/components/AsyncView"
import { extensionsAtom } from "@/features/extensions/atoms"
import { McpServersSettings } from "@/features/extensions/McpServersSettings"
import { SkillsSettings } from "@/features/extensions/SkillsSettings"
import { projectsAtom } from "@/features/projects/atoms"
import { SettingsFrame, SettingsPane } from "./SettingsLayout.tsx"

export function McpSettings() {
  return (
    <ExtensionsFrame
      id="settings-mcp"
      title="MCP"
      errorTitle="Could not load MCP servers"
      description={
        <>
          Tools for the agent. A repository's own{" "}
          <code className="font-mono text-xs">.mcp.json</code> is loaded too.
        </>
      }
    >
      {(extensions, repositoryName) => (
        <McpServersSettings servers={extensions.mcpServers} repositoryName={repositoryName} />
      )}
    </ExtensionsFrame>
  )
}

export function SkillSettings() {
  return (
    <ExtensionsFrame
      id="settings-skills"
      title="Skills"
      errorTitle="Could not load skills"
      description={
        <>
          Instructions the agent loads when a task needs them. A repository's own{" "}
          <code className="font-mono text-xs">.claude/skills</code> are loaded too.
        </>
      }
    >
      {(extensions, repositoryName) => (
        <SkillsSettings skills={extensions.skills} repositoryName={repositoryName} />
      )}
    </ExtensionsFrame>
  )
}

function ExtensionsFrame({
  id,
  title,
  errorTitle,
  description,
  children,
}: {
  readonly id: string
  readonly title: string
  readonly errorTitle: string
  readonly description: ReactNode
  readonly children: (
    extensions: {
      readonly mcpServers: ReadonlyArray<McpServer>
      readonly skills: ReadonlyArray<Skill>
    },
    repositoryName: string | undefined,
  ) => ReactNode
}) {
  const { projectId } = useParams({ strict: false })
  const projects = useAtomValue(projectsAtom)
  const project = AsyncResult.isSuccess(projects)
    ? projects.value.find((candidate) => candidate.id === projectId)
    : undefined
  const extensions = useAtomValue(extensionsAtom((project?.id ?? null) as ProjectId | null))

  return (
    <SettingsFrame id={id} title={title} description={description}>
      <SettingsPane>
        <AsyncView result={extensions} errorTitle={errorTitle}>
          {(value) => children(value, project?.name)}
        </AsyncView>
      </SettingsPane>
    </SettingsFrame>
  )
}
