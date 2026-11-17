import { cn } from "cn"
import { type ComponentProps, useMemo, useRef } from "react"
import { InputGroupTextarea } from "@/components/ui/input-group"
import { splitMentions } from "./fileMention.ts"
import { FileTypeIcon } from "./FileTypeIcon.tsx"

const END_OF_TEXT = "\u200b"

export function MentionTextarea({
  className,
  value,
  onScroll,
  ...props
}: ComponentProps<typeof InputGroupTextarea>) {
  const mirror = useRef<HTMLDivElement>(null)
  const text = typeof value === "string" ? value : ""
  const segments = useMemo(() => splitMentions(text), [text])

  return (
    <div className="relative flex w-full flex-1">
      <div
        ref={mirror}
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 overflow-hidden px-4 pt-3.5 pb-2 text-base wrap-break-word whitespace-pre-wrap text-foreground [scrollbar-gutter:stable] md:text-sm",
          props.disabled === true && "opacity-50",
        )}
      >
        {segments.map((segment, index) =>
          segment.kind === "text" ? (
            segment.text
          ) : (
            <span key={index} className="text-file-ref">
              <span className="relative text-transparent">
                @
                <FileTypeIcon
                  path={segment.path}
                  tight
                  className="absolute top-1/2 right-[0.153em] size-[0.85em] -translate-y-1/2"
                />
              </span>
              {segment.text.slice(1)}
            </span>
          ),
        )}
        {END_OF_TEXT}
      </div>
      <InputGroupTextarea
        value={value}
        spellCheck={false}
        onScroll={(event) => {
          if (mirror.current !== null) mirror.current.scrollTop = event.currentTarget.scrollTop
          onScroll?.(event)
        }}
        className={cn(
          "relative px-4 pt-3.5 text-transparent caret-foreground [scrollbar-gutter:stable] selection:bg-file-ref/25 selection:text-transparent",
          className,
        )}
        {...props}
      />
    </div>
  )
}
