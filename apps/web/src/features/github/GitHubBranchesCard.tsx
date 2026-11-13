import { useAtomValue } from "@effect/atom-react"
import type { Project } from "@humanity/contracts"
import { GitBranch, Shield } from "lucide-react"
import { AsyncView } from "@/components/AsyncView"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { githubBranchesAtom } from "./atoms.ts"
import { ScrollArea } from "@/components/ui/scroll-area"

/** Branches as GitHub sees them. Start a session from any `origin/<name>` in the session form. */
export function GitHubBranchesCard({
  project,
  fullName,
}: {
  readonly project: Project
  readonly fullName: string
}) {
  const branches = useAtomValue(githubBranchesAtom(fullName))
  return (
    <Card>
      <CardHeader>
        <CardTitle>On GitHub</CardTitle>
        <CardDescription>
          Branches of <code>{fullName}</code>. To work on one, start a session from{" "}
          <code>origin/&lt;branch&gt;</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AsyncView result={branches} errorTitle="Could not list GitHub branches">
          {(list) => (
            <ScrollArea className="rounded-md border" viewportClassName="max-h-60">
              <ul className="flex flex-col divide-y">
                {list.map((branch) => (
                  <li key={branch.name} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <GitBranch className="size-3.5 text-muted-foreground" />
                    <code className="font-mono text-xs">{branch.name}</code>
                    {branch.name === project.defaultBranch && (
                      <Badge variant="secondary">default</Badge>
                    )}
                    {branch.protected && (
                      <Badge variant="outline">
                        <Shield />
                        protected
                      </Badge>
                    )}
                    <code className="ml-auto text-xs text-muted-foreground">
                      {branch.commitSha.slice(0, 7)}
                    </code>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </AsyncView>
      </CardContent>
    </Card>
  )
}
