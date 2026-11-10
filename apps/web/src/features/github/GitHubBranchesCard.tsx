import { useAtomValue } from "@effect/atom-react"
import type { Project } from "@humanity/contracts"
import { GitBranch, Shield } from "lucide-react"
import { AsyncView } from "@/components/AsyncView"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { githubBranchesAtom } from "./atoms.ts"

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
            <ul className="flex max-h-60 flex-col divide-y overflow-y-auto rounded-md border">
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
          )}
        </AsyncView>
      </CardContent>
    </Card>
  )
}
