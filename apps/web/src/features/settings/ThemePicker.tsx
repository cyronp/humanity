import { cn } from "cn"
import { ArrowUp, type LucideIcon, Moon, Sun } from "lucide-react"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"
import type { CSSProperties } from "react"
import { COLOR_THEMES, type ColorThemeId, type ColorThemeMode, colorTheme } from "@/lib/colorThemes"
import type { ThemeChoice } from "@/lib/theme"

const CHOICES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const satisfies ReadonlyArray<{ readonly value: ThemeChoice; readonly label: string }>

const previewStyle = (mode: ColorThemeMode): CSSProperties =>
  ({
    "--pv-page": mode.tokens.sidebar,
    "--pv-chat": mode.tokens.chat,
    "--pv-card": mode.tokens.card,
    "--pv-border": mode.tokens.border,
    "--pv-muted": mode.tokens.muted,
    "--pv-line": `color-mix(in oklab, ${mode.tokens["muted-foreground"]} 35%, transparent)`,
    "--pv-strong": mode.tokens["muted-foreground"],
    "--pv-brand": mode.tokens.primary,
    "--pv-modified": mode.tokens["git-modified"],
    "--pv-added": mode.tokens["git-added"],
    "--pv-removed": mode.tokens["git-deleted"],
  }) as CSSProperties

const DIFF_ROWS = [
  { kind: "context", width: "60%" },
  { kind: "remove", width: "72%" },
  { kind: "remove", width: "48%" },
  { kind: "add", width: "80%" },
  { kind: "add", width: "64%" },
  { kind: "add", width: "40%" },
  { kind: "context", width: "52%" },
] as const

const ITEM = cn(
  "group flex min-w-0 flex-col gap-2 rounded-xl border bg-muted/40 p-1.5 pb-2 text-xs text-muted-foreground transition-colors outline-none sm:p-2 sm:text-sm",
  "hover:border-foreground/20 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
  "data-[state=on]:border-brand data-[state=on]:font-medium data-[state=on]:text-foreground data-[state=on]:ring-1 data-[state=on]:ring-brand",
)

export function ThemePicker({
  labelledBy,
  value,
  colorThemeId,
  onChange,
}: {
  readonly labelledBy: string
  readonly value: ThemeChoice
  readonly colorThemeId: ColorThemeId
  readonly onChange: (value: ThemeChoice) => void
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      aria-labelledby={labelledBy}
      value={value}
      onValueChange={(next) => {
        const choice = CHOICES.find((candidate) => candidate.value === next)
        if (choice !== undefined) onChange(choice.value)
      }}
      className="grid grid-cols-3 gap-2 sm:gap-3"
    >
      {CHOICES.map(({ value: choice, label }) => (
        <ToggleGroupPrimitive.Item key={choice} value={choice} className={ITEM}>
          <ThemePreview choice={choice} colorThemeId={colorThemeId} />
          <span className="truncate">{label}</span>
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  )
}

export function ColorThemePicker({
  labelledBy,
  value,
  onChange,
}: {
  readonly labelledBy: string
  readonly value: ColorThemeId
  readonly onChange: (value: ColorThemeId) => void
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      aria-labelledby={labelledBy}
      value={value}
      onValueChange={(next) => {
        const theme = COLOR_THEMES.find((candidate) => candidate.id === next)
        if (theme !== undefined) onChange(theme.id)
      }}
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3"
    >
      {COLOR_THEMES.map((theme) => (
        <ToggleGroupPrimitive.Item
          key={theme.id}
          value={theme.id}
          title={theme.description}
          className={cn(
            "group flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-3 pt-5 text-left text-sm text-muted-foreground transition-colors outline-none",
            "hover:border-foreground/20 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
            "data-[state=on]:border-foreground/20 data-[state=on]:text-foreground",
          )}
        >
          <span aria-hidden="true" className="flex items-center justify-center gap-5">
            <SendSwatch mode={theme.light} icon={Sun} />
            <SendSwatch mode={theme.dark} icon={Moon} />
          </span>
          <span className="truncate font-medium">{theme.label}</span>
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  )
}

function SendSwatch({
  mode,
  icon: Icon,
}: {
  readonly mode: ColorThemeMode
  readonly icon: LucideIcon
}) {
  return (
    <span
      style={{ background: mode.tokens.primary, color: mode.tokens["primary-foreground"] }}
      className={cn(
        "relative grid size-11 place-items-center rounded-full shadow-sm ring-offset-3 ring-offset-card transition-shadow sm:size-12",
        "group-hover:shadow-md group-data-[state=on]:ring-2 group-data-[state=on]:ring-brand",
      )}
    >
      <ArrowUp className="size-5" />
      <span className="absolute -right-1.5 -bottom-1.5 hidden size-5 place-items-center rounded-full border bg-card text-foreground group-data-[state=on]:grid">
        <Icon className="size-3" />
      </span>
    </span>
  )
}

function ThemePreview({
  choice,
  colorThemeId,
}: {
  readonly choice: ThemeChoice
  readonly colorThemeId: ColorThemeId
}) {
  const theme = colorTheme(colorThemeId)
  return (
    <span
      aria-hidden="true"
      className="@container relative block aspect-[16/10] w-full overflow-hidden rounded-md"
    >
      {choice === "system" ? (
        <>
          <MiniApp mode={theme.light} />
          <MiniApp mode={theme.dark} className="[clip-path:inset(0_0_0_50%)]" />
        </>
      ) : (
        <MiniApp mode={theme[choice]} />
      )}
    </span>
  )
}

function MiniApp({
  mode,
  className,
}: {
  readonly mode: ColorThemeMode
  readonly className?: string
}) {
  return (
    <span
      style={previewStyle(mode)}
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
              kind === "add" && "bg-(--pv-added)/15",
              kind === "remove" && "bg-(--pv-removed)/15",
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
