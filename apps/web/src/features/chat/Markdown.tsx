import { memo } from "react"
import { Streamdown } from "streamdown"
import "streamdown/styles.css"
import { shikiCodePlugin } from "./codePlugin.ts"

const plugins = { code: shikiCodePlugin }

/** Agent-written markdown. `streaming` tolerates half-finished syntax while text arrives. */
export const Markdown = memo(function Markdown({
  text,
  streaming = false,
}: {
  readonly text: string
  readonly streaming?: boolean
}) {
  return (
    <Streamdown
      className="text-sm leading-relaxed [&_pre]:text-xs"
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      plugins={plugins}
    >
      {text}
    </Streamdown>
  )
})
