import {
  ChevronRight,
  KeyRound,
  Lock,
  type LucideIcon,
  Monitor,
  Server,
  UserRound,
} from "lucide-react"
import { AsyncResult } from "effect/reactivity"
import { Fragment, type ReactNode } from "react"
import { useAtomValue } from "@effect/atom-react"
import { claudeStatusAtom } from "@/features/claude/atoms"
import { ClaudeMark } from "@/features/claude/ClaudeMark"

interface Node {
  readonly key: string
  readonly icon: ReactNode
  readonly title: string
  readonly caption: string
}

const icon = (Icon: LucideIcon) => <Icon className="size-5" aria-hidden="true" />

export function HowItConnectsStep() {
  const status = useAtomValue(claudeStatusAtom)
  const known = AsyncResult.isSuccess(status) ? status.value : undefined
  const version = known?.cliVersion ?? null
  const configDir = known?.configDir ?? "~/.claude"

  const nodes: ReadonlyArray<Node> = [
    { key: "browser", icon: icon(Monitor), title: "This page", caption: "Where you review" },
    {
      key: "daemon",
      icon: icon(Server),
      title: "Humanity daemon",
      caption: "Runs on this computer, 127.0.0.1 only",
    },
    {
      key: "claude-code",
      icon: <ClaudeMark className="size-5" />,
      title: "Claude Code",
      caption: version === null ? "Bundled with Humanity" : `v${version}, bundled`,
    },
    {
      key: "account",
      icon: icon(UserRound),
      title: "Your Claude account",
      caption: "Pro, Max, Team or Enterprise",
    },
  ]
  const links = ["private token", "Agent SDK", "your login"]

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight">
          Humanity runs Claude Code, signed in as you
        </h2>
        <p className="max-w-prose text-muted-foreground">
          There is no separate Humanity account and no API key to paste. Humanity starts the same
          Claude Code you use in a terminal, and Claude Code signs in with the Claude subscription
          you already have.
        </p>
      </div>

      <ol
        aria-label="How the pieces connect"
        className="flex flex-col items-stretch gap-1 md:flex-row md:items-center"
      >
        {nodes.map((node, index) => (
          <Fragment key={node.key}>
            {index > 0 && <Connector label={links[index - 1] ?? ""} />}
            <li className="flex flex-1 items-center gap-3 rounded-xl border bg-card p-3 md:flex-col md:items-center md:text-center">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                {node.icon}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">{node.title}</span>
                <span className="text-xs text-muted-foreground">{node.caption}</span>
              </span>
            </li>
          </Fragment>
        ))}
      </ol>

      <ul className="grid gap-4 sm:grid-cols-2">
        <Fact icon={KeyRound} title="Your credentials stay with Claude Code">
          The login lives in <code className="break-all">{configDir}</code>. Humanity never reads,
          copies or stores it, and its database holds no keys or tokens.
        </Fact>
        <Fact icon={UserRound} title="Usage counts against your plan">
          Sessions draw from the same limits as Claude Code in your terminal. If an{" "}
          <code>ANTHROPIC_API_KEY</code> is set, Claude Code bills that key instead, and Humanity
          tells you.
        </Fact>
        <Fact icon={Lock} title="Only you can drive it">
          The daemon listens on 127.0.0.1 and accepts this tab only with the private token it
          printed when it started.
        </Fact>
        <Fact icon={Server} title="Claude Code does the talking">
          Prompts go from Claude Code to Anthropic, as they would from your terminal. Humanity sits
          in between to hold every change until you approve it.
        </Fact>
      </ul>
    </div>
  )
}

function Connector({ label }: { readonly label: string }) {
  return (
    <li
      aria-hidden="true"
      className="flex items-center justify-center gap-1 py-1 text-[11px] text-muted-foreground md:flex-col md:px-1"
    >
      <ChevronRight className="size-4 rotate-90 md:rotate-0" />
      <span className="whitespace-nowrap">{label}</span>
    </li>
  )
}

function Fact({
  icon: Icon,
  title,
  children,
}: {
  readonly icon: LucideIcon
  readonly title: string
  readonly children: ReactNode
}) {
  return (
    <li className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">{children}</span>
      </div>
    </li>
  )
}
