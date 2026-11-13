import { useAtomValue } from "@effect/atom-react"
import type { ProjectId } from "@humanity/contracts"
import { useParams } from "@tanstack/react-router"
import { AsyncResult } from "effect/reactivity"
import { AsyncView } from "@/components/AsyncView"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { extensionsAtom } from "@/features/extensions/atoms"
import { McpServersSettings } from "@/features/extensions/McpServersSettings"
import { SkillsSettings } from "@/features/extensions/SkillsSettings"
import { projectsAtom } from "@/features/projects/atoms"
import { SettingsFrame, SettingsPane } from "./SettingsLayout.tsx"

/**
 * MCP servers and skills: Humanity's own, which reach every project, and
 * those of the repository open behind the settings, shown read-only.
 */
export function ExtensionsSettings() {
  const { projectId } = useParams({ strict: false })
  const projects = useAtomValue(projectsAtom)
  const project = AsyncResult.isSuccess(projects)
    ? projects.value.find((candidate) => candidate.id === projectId)
    : undefined
  const extensions = useAtomValue(extensionsAtom((project?.id ?? null) as ProjectId | null))

  return (
    <SettingsFrame
      id="settings-extensions"
      title="MCP & Skills"
      description={
        <>
          Tools and know-how for the agent. Use them from the message box with its + button. A
          repository's own <code className="font-mono text-xs">.mcp.json</code> and{" "}
          <code className="font-mono text-xs">.claude/skills</code> are picked up too.
        </>
      }
    >
      <SettingsPane>
        <AsyncView result={extensions} errorTitle="Could not load MCP servers and skills">
          {(value) => (
            <Tabs defaultValue="mcp" className="gap-4">
              <TabsList>
                <TabsTrigger value="mcp">MCP servers</TabsTrigger>
                <TabsTrigger value="skills">Skills</TabsTrigger>
              </TabsList>
              <TabsContent value="mcp">
                <McpServersSettings servers={value.mcpServers} repositoryName={project?.name} />
              </TabsContent>
              <TabsContent value="skills">
                <SkillsSettings skills={value.skills} repositoryName={project?.name} />
              </TabsContent>
            </Tabs>
          )}
        </AsyncView>
      </SettingsPane>
    </SettingsFrame>
  )
}
