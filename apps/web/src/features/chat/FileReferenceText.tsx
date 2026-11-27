import { useMemo } from "react"
import { splitMentions } from "./fileMention.ts"
import { FileTypeIcon } from "./FileTypeIcon.tsx"

export function FileReferenceText({
  text,
  mentions,
}: {
  readonly text: string
  readonly mentions: ReadonlyArray<string>
}) {
  const segments = useMemo(() => splitMentions(text, new Set(mentions)), [text, mentions])
  return segments.map((segment, index) =>
    segment.kind === "text" ? (
      segment.text
    ) : (
      <span
        key={index}
        title={segment.path}
        className="font-medium text-file-ref decoration-current/60 underline-offset-2 hover:underline"
      >
        <FileTypeIcon
          path={segment.path}
          tight
          className="mr-[0.3em] ml-[0.05em] inline-block size-[0.85em] align-[-0.1em]"
        />
        {segment.path}
      </span>
    ),
  )
}
