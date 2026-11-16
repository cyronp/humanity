import { cn } from "cn"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"
import type { CSSProperties } from "react"
import type { Theme, ThemeChoice } from "@/lib/theme"

const CHOICES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const satisfies ReadonlyArray<{ readonly value: ThemeChoice; readonly label: string }>

/**
 * The colours of each theme, from `index.css` and the diff's row tints. A
 * preview shows its own theme whatever the page's is, so it can't read the
 * page's variables.
 */
const PALETTES: Readonly<Record<Theme, CSSProperties>> = {
  light: {
    "--pv-page": "oklch(1 0 0)",
    "--pv-chat": "oklch(0.985 0 0)",
    "--pv-card": "oklch(1 0 0)",
    "--pv-border": "oklch(0.922 0 0)",
    "--pv-muted": "oklch(0.95 0 0)",
    "--pv-line": "oklch(0.9 0 0)",
    "--pv-strong": "oklch(0.7 0 0)",
    "--pv-brand": "#2563eb",
    "--pv-modified": "#d97706",
    "--pv-added": "#059669",
    "--pv-removed": "#dc2626",
  } as CSSProperties,
  dark: {
    "--pv-page": "oklch(0.145 0 0)",
    "--pv-chat": "oklch(0.205 0 0)",
    "--pv-card": "oklch(0.205 0 0)",
    "--pv-border": "oklch(1 0 0 / 12%)",
    "--pv-muted": "oklch(0.269 0 0)",
    "--pv-line": "oklch(0.32 0 0)",
    "--pv-strong": "oklch(0.55 0 0)",
    "--pv-brand": "#60a5fa",
    "--pv-modified": "#fbbf24",
    "--pv-added": "#34d399",
    "--pv-removed": "#f87171",
  } as CSSProperties,
}

/** The rows of the hunk in the preview's diff panel, and how long each line is. */
const DIFF_ROWS = [
  { kind: "context", width: "60%" },
  { kind: "remove", width: "72%" },
  { kind: "remove", width: "48%" },
  { kind: "add", width: "80%" },
  { kind: "add", width: "64%" },
  { kind: "add", width: "40%" },
  { kind: "context", width: "52%" },
] as const

/**
 * The theme as three small pictures of the app: System, Light and Dark. One
 * is always picked; arrow keys move between them.
 */
export function ThemePicker({
  labelledBy,
  value,
  onChange,
}: {
  /** The id of the label that names the choice. */
  readonly labelledBy: string
  readonly value: ThemeChoice
  readonly onChange: (value: ThemeChoice) => void
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      aria-labelledby={labelledBy}
      value={value}
      onValueChange={(next) => {
        // Pressing the picked option again would clear it; one stays picked.
        const choice = CHOICES.find((candidate) => candidate.value === next)
        if (choice !== undefined) onChange(choice.value)
      }}
      className="grid grid-cols-3 gap-2 sm:gap-3"
    >
      {CHOICES.map(({ value: choice, label }) => (
        <ToggleGroupPrimitive.Item
          key={choice}
          value={choice}
          className={cn(
            "group flex min-w-0 flex-col gap-2 rounded-xl border bg-muted/40 p-1.5 pb-2 text-xs text-muted-foreground transition-colors outline-none sm:p-2 sm:text-sm",
            "hover:border-foreground/20 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
            "data-[state=on]:border-brand data-[state=on]:font-medium data-[state=on]:text-foreground data-[state=on]:ring-1 data-[state=on]:ring-brand",
          )}
        >
          <ThemePreview choice={choice} />
          <span className="truncate">{label}</span>
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  )
}

/** A small picture of the app in one theme, or split down the middle for System. */
function ThemePreview({ choice }: { readonly choice: ThemeChoice }) {
  return (
    <span
      aria-hidden="true"
      className="@container relative block aspect-[16/10] w-full overflow-hidden rounded-md"
    >
      {choice === "system" ? (
        <>
          <MiniApp theme="light" />
          <MiniApp theme="dark" className="[clip-path:inset(0_0_0_50%)]" />
        </>
      ) : (
        <MiniApp theme={choice} />
      )}
    </span>
  )
}

/**
 * A thread drawn in blocks: the sidebar with its new-thread button and
 * threads, the chat with the human's message, the agent's reply and the
 * composer, and the diff panel with its tabs and a changed file. Sizes are in
 * `cqw` so it scales with the card.
 */
function MiniApp({ theme, className }: { readonly theme: Theme; readonly className?: string }) {
  return (
    <span
      style={PALETTES[theme]}
      className={cn(
        "absolute inset-0 flex overflow-hidden rounded-md border border-(--pv-border) bg-(--pv-page)",
        className,
      )}
    >
      <span className="flex w-[17cqw] shrink-0 flex-col gap-[2cqw] border-r border-(--pv-border) p-[2.5cqw]">
        <span className="mb-[1cqw] h-[4.5cqw] rounded-full border border-(--pv-border) bg-(--pv-card)" />
        <span className="h-[3.5cqw] rounded-[1.2cqw] bg-(--pv-muted)" />
        <span className="h-[3.5cqw] rounded-[1.2cqw] bg-(--pv-muted)" />
        <span className="h-[3.5cqw] w-[80%] rounded-[1.2cqw] bg-(--pv-muted)" />
      </span>
      <span className="relative flex min-w-0 flex-1 flex-col bg-(--pv-chat) p-[3.5cqw]">
        <span className="h-[5cqw] w-[15cqw] self-end rounded-full bg-(--pv-muted)" />
        <span className="mt-[4cqw] h-[2cqw] w-[85%] rounded-full bg-(--pv-line)" />
        <span className="mt-[2cqw] h-[2cqw] w-[60%] rounded-full bg-(--pv-line)" />
        <span className="mt-[3cqw] h-[4cqw] w-[70%] rounded-[1.2cqw] border border-(--pv-border) bg-(--pv-card)" />
        <span className="absolute right-[3cqw] bottom-[3.5cqw] left-[3cqw] flex h-[8cqw] items-center justify-between rounded-[2cqw] border border-(--pv-border) bg-(--pv-card) px-[2cqw]">
          <span className="h-[1.6cqw] w-[45%] rounded-full bg-(--pv-line)" />
          <span className="size-[4cqw] rounded-full bg-(--pv-brand)" />
        </span>
      </span>
      <span className="flex w-[43cqw] shrink-0 flex-col border-l border-(--pv-border)">
        <span className="flex h-[7cqw] shrink-0 items-stretch gap-[2.5cqw] border-b border-(--pv-border) px-[2.5cqw]">
          <span className="flex items-center border-b border-(--pv-strong)">
            <span className="h-[1.6cqw] w-[6cqw] rounded-full bg-(--pv-strong)" />
          </span>
          <span className="flex items-center">
            <span className="h-[1.6cqw] w-[6cqw] rounded-full bg-(--pv-line)" />
          </span>
          <span className="flex items-center">
            <span className="h-[1.6cqw] w-[5cqw] rounded-full bg-(--pv-line)" />
          </span>
        </span>
        <span className="flex flex-col gap-[2cqw] p-[2.5cqw]">
          <DiffFile open />
          <DiffFile />
        </span>
      </span>
    </span>
  )
}

/** A changed file in the diff panel: its header, and its hunk when open. */
function DiffFile({ open = false }: { readonly open?: boolean }) {
  return (
    <span className="flex flex-col overflow-hidden rounded-[1.2cqw] border border-(--pv-border) bg-(--pv-card)">
      <span
        className={cn(
          "flex h-[4.5cqw] items-center gap-[1.5cqw] bg-(--pv-muted)/50 px-[1.8cqw]",
          open && "border-b border-(--pv-border)",
        )}
      >
        <span className="size-[1.8cqw] shrink-0 rounded-[0.4cqw] bg-(--pv-modified)" />
        <span className="h-[1.6cqw] w-[14cqw] rounded-full bg-(--pv-strong)" />
        <span className="ml-auto h-[1.4cqw] w-[2.5cqw] rounded-full bg-(--pv-added)" />
        <span className="h-[1.4cqw] w-[2cqw] rounded-full bg-(--pv-removed)" />
      </span>
      {open &&
        DIFF_ROWS.map(({ kind, width }, index) => (
          <span
            key={index}
            className={cn(
              "flex h-[3cqw] items-center gap-[1.5cqw] pr-[1.8cqw]",
              kind === "add" && "bg-emerald-500/15",
              kind === "remove" && "bg-red-500/15",
            )}
          >
            <span className="h-full w-[4cqw] shrink-0 border-r border-(--pv-border)" />
            <span
              className={cn(
                "h-[1.3cqw] rounded-full",
                kind === "add"
                  ? "bg-(--pv-added)/60"
                  : kind === "remove"
                    ? "bg-(--pv-removed)/60"
                    : "bg-(--pv-line)",
              )}
              style={{ width }}
            />
          </span>
        ))}
    </span>
  )
}
