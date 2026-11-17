import { parseThreadHref } from "@humanity/contracts"
import { type ComponentProps, memo } from "react"
import { defaultComponents, Streamdown } from "streamdown"
import "streamdown/styles.css"
import { ThreadMention } from "@/features/session/ThreadMention"
import { shikiCodePlugin } from "./codePlugin.ts"

const plugins = { code: shikiCodePlugin }

const DefaultLink = defaultComponents.a

function MarkdownLink(props: ComponentProps<typeof DefaultLink>) {
  const thread = typeof props.href === "string" ? parseThreadHref(props.href) : undefined
  if (thread === undefined) return <DefaultLink {...props} />
  return <ThreadMention {...thread}>{props.children}</ThreadMention>
}

const components = { a: MarkdownLink }

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
      components={components}
    >
      {text}
    </Streamdown>
  )
})
