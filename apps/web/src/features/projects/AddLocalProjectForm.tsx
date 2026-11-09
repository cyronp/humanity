import { useAtomSet } from "@effect/atom-react"
import { Exit } from "effect"
import { FolderPlus } from "lucide-react"
import { type FormEvent, useState } from "react"
import { ErrorNote } from "@/components/ErrorNote"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { addLocalProjectAtom } from "./atoms.ts"

export function AddLocalProjectForm() {
  const addLocal = useAtomSet(addLocalProjectAtom, { mode: "promiseExit" })
  const [path, setPath] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (path.trim() === "" || pending) return
    setPending(true)
    setError(undefined)
    const exit = await addLocal({ payload: { path }, reactivityKeys: [keys.projects] })
    setPending(false)
    if (Exit.isSuccess(exit)) setPath("")
    else setError(describeCause(exit.cause))
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Label htmlFor="project-path">Path of a local git repository</Label>
      <div className="flex gap-2">
        <Input
          id="project-path"
          value={path}
          onChange={(event) => setPath(event.target.value)}
          placeholder="C:\code\my-repo or /home/me/code/my-repo"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
        <Button type="submit" disabled={pending || path.trim() === ""}>
          <FolderPlus />
          {pending ? "Adding…" : "Add project"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Humanity never edits this folder. Each agent session works in its own git worktree under{" "}
        <code>~/.humanity</code>.
      </p>
      {error !== undefined && <ErrorNote title="Could not add the project" message={error} />}
    </form>
  )
}
