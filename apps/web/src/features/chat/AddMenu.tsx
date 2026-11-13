import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { McpServer, ProjectId, Skill } from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { Paperclip, Plus, Server, Settings2, Sparkles } from "lucide-react"
import { useRef, useState } from "react"
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { extensionsAtom } from "@/features/extensions/atoms"
import {
  describeTransport,
  mcpMention,
  menuScore,
  type PromptInsertion,
  usableServers,
} from "@/features/extensions/prompt"
import { openSettings } from "@/features/settings/settings"
import { describeCause } from "@/lib/errors"

/** Entries list their name first in `keywords`, then what else they may be found by. */
const filter = (value: string, search: string, keywords?: ReadonlyArray<string>) =>
  menuScore(keywords?.[0] ?? value, keywords?.slice(1) ?? [], search)

/**
 * The message box's "+": everything that can go into a message. Files from
 * disk first (pasting and dropping them works too), then the skills and MCP
 * servers the agent of this project can use; picking one puts its call in
 * the message. The last row opens the settings to add or change them.
 */
export function AddMenu({
  projectId,
  onFiles,
  onInsert,
  disabled = false,
}: {
  readonly projectId: ProjectId
  readonly onFiles: (files: ReadonlyArray<File>) => void
  readonly onInsert: (insertion: PromptInsertion) => void
  readonly disabled?: boolean
}) {
  const atom = extensionsAtom(projectId)
  const result = useAtomValue(atom)
  const refresh = useAtomRefresh(atom)
  const [open, setOpen] = useState(false)
  // Outside the popover, which unmounts on close, so its change still arrives.
  const fileInput = useRef<HTMLInputElement>(null)
  // After a pick the caret belongs in the message box, not back on this button.
  const picked = useRef(false)

  const pick = (insertion: PromptInsertion) => {
    picked.current = true
    setOpen(false)
    onInsert(insertion)
  }

  const attach = () => {
    setOpen(false)
    fileInput.current?.click()
  }

  const manage = () => {
    setOpen(false)
    openSettings("extensions")
  }

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        tabIndex={-1}
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []))
          // Picking the same file again must fire again.
          event.target.value = ""
        }}
      />
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          // A skill just added to the repository shows without a reload.
          if (next) refresh()
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild disabled={disabled}>
              <InputGroupButton
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                aria-label="Add files, skills or MCP servers"
              >
                <Plus />
              </InputGroupButton>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Add files, a skill or an MCP server</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="start"
          className="w-[26rem] max-w-[calc(100vw-2rem)] gap-0 p-0"
          onCloseAutoFocus={(event) => {
            if (!picked.current) return
            picked.current = false
            event.preventDefault()
          }}
        >
          <Command filter={filter} className="rounded-lg! bg-transparent">
            <CommandInput placeholder="Search skills and MCP servers…" />
            {/* Never taller than the room the popover has, so the footer stays on screen. */}
            <CommandList className="max-h-[min(24rem,calc(var(--radix-popover-content-available-height)-6rem))]">
              <CommandGroup>
                <CommandItem
                  value="attach files"
                  keywords={["Attach files", "upload images pdf text documents"]}
                  onSelect={attach}
                  className="gap-3 py-2"
                >
                  <Paperclip className="text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-medium">Attach files…</span>
                    <span className="text-xs text-muted-foreground">
                      Images, PDFs or text. You can also paste or drop them.
                    </span>
                  </span>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              {AsyncResult.match(result, {
                onInitial: () => (
                  <div className="flex flex-col gap-2 p-3" aria-busy="true">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ),
                onFailure: ({ cause }) => (
                  <p className="px-3 py-4 text-sm text-destructive" role="alert">
                    Could not load them: {describeCause(cause)}
                  </p>
                ),
                onSuccess: ({ value }) => (
                  <Entries
                    skills={value.skills}
                    servers={usableServers(value.mcpServers)}
                    onPick={pick}
                  />
                ),
              })}
            </CommandList>
          </Command>
          {/* Below the scrolling list, so the settings stay one step away whatever the search. */}
          <button
            type="button"
            onClick={manage}
            className="flex h-10 shrink-0 items-center gap-2 border-t px-4 text-left text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground"
          >
            <Settings2 className="size-4 shrink-0" aria-hidden="true" />
            Add or manage MCP servers and skills…
          </button>
        </PopoverContent>
      </Popover>
    </>
  )
}

function Entries({
  skills,
  servers,
  onPick,
}: {
  readonly skills: ReadonlyArray<Skill>
  readonly servers: ReadonlyArray<McpServer>
  readonly onPick: (insertion: PromptInsertion) => void
}) {
  if (skills.length === 0 && servers.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
        No skills or MCP servers yet. Add one in the settings, or put a skill in the repository's{" "}
        <code className="font-mono text-xs">.claude/skills</code>.
      </p>
    )
  }
  return (
    <>
      <CommandEmpty>Nothing matches.</CommandEmpty>
      {skills.length > 0 && (
        <CommandGroup heading="Skills">
          {skills.map((skill) => (
            <CommandItem
              key={`${skill.source}:${skill.name}`}
              value={`skill ${skill.source} ${skill.invocation}`}
              keywords={[skill.name, skill.invocation, skill.description]}
              onSelect={() => onPick({ kind: "skill", invocation: skill.invocation })}
              title={skill.description}
              className="items-start gap-3 py-2"
            >
              <Sparkles className="mt-0.5 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="truncate font-mono text-xs font-medium">{skill.invocation}</span>
                  <Origin source={skill.source} />
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
      {servers.length > 0 && (
        <CommandGroup heading="MCP servers">
          {servers.map((server) => (
            <CommandItem
              key={`${server.source}:${server.name}`}
              value={`mcp ${server.source} ${server.name}`}
              keywords={[server.name, describeTransport(server.transport)]}
              onSelect={() => onPick({ kind: "mcp", server: server.name })}
              title={`Puts ${mcpMention(server.name)} in the message: the prefix of this server's tools`}
              className="items-start gap-3 py-2"
            >
              <Server className="mt-0.5 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{server.name}</span>
                  <Origin source={server.source} />
                </span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {describeTransport(server.transport)}
                </span>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </>
  )
}

/** Where an entry comes from, for the ones the repository brings. */
function Origin({ source }: { readonly source: Skill["source"] }) {
  if (source === "humanity") return null
  return (
    <span className="shrink-0 rounded-sm bg-muted px-1 text-[0.65rem] text-muted-foreground">
      repository
    </span>
  )
}
