import type { ReactNode } from "react"
import { type KeyboardEvent, useId, useState } from "react"
import { usePromptInsert } from "@/features/extensions/usePromptInsert"
import { AttachmentTray, dropTargetClass, useAttachmentDraft } from "./attachments.tsx"
import { ChatBox, ChatBoxFooter, noteMessageSent, sendKeyPressed } from "./ChatBox.tsx"
import { FileMentionMenu, fileMentionIds } from "./FileMentionMenu.tsx"
import { MentionTextarea } from "./MentionTextarea.tsx"
import { type FileSearch, useFileMention } from "./useFileMention.ts"

export const usePromptDraft = ({
  initialText = "",
  search,
  recentScope,
  disabled,
}: {
  readonly initialText?: string
  readonly search: FileSearch
  readonly recentScope: string
  readonly disabled: boolean
}) => {
  const [text, setText] = useState(initialText)
  const files = useAttachmentDraft()
  const { textarea, insert } = usePromptInsert(text, setText)
  const mentions = useFileMention({ text, setText, textarea, search, recentScope, disabled })
  const extras = {
    ...(files.uploads.length === 0 ? {} : { attachments: files.uploads }),
    ...(mentions.picked.length === 0 ? {} : { mentions: mentions.picked }),
  }
  const sent = () => {
    noteMessageSent()
    setText("")
    mentions.sent()
    files.clear()
  }
  return { text, setText, files, textarea, insert, mentions, extras, sent }
}

export type PromptDraft = ReturnType<typeof usePromptDraft>

export function PromptBox({
  draft,
  disabled,
  onSubmit,
  placeholder,
  label,
  autoFocus,
  className,
  footer,
}: {
  readonly draft: PromptDraft
  readonly disabled: boolean
  readonly onSubmit: () => void
  readonly placeholder: string
  readonly label: string
  readonly autoFocus?: boolean
  readonly className?: string
  readonly footer: ReactNode
}) {
  const { text, textarea, mentions, files } = draft
  const idBase = useId()
  const mentionIds = fileMentionIds(idBase)

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentions.onKeyDown(event)) return
    if (sendKeyPressed(event)) {
      event.preventDefault()
      onSubmit()
    }
  }

  return (
    <ChatBox
      className={dropTargetClass}
      behind={
        mentions.menu !== undefined && <FileMentionMenu menu={mentions.menu} idBase={idBase} />
      }
      {...(disabled ? {} : files.dropProps)}
    >
      <AttachmentTray draft={files} />
      <MentionTextarea
        ref={textarea}
        value={text}
        mentions={mentions.picked}
        {...mentions.textareaProps}
        aria-controls={mentions.menu === undefined ? undefined : mentionIds.list}
        aria-activedescendant={
          mentions.menu === undefined || mentions.menu.highlighted < 0
            ? undefined
            : mentionIds.option(mentions.menu.highlighted)
        }
        onKeyDown={onKeyDown}
        onPaste={disabled ? undefined : files.onPaste}
        placeholder={placeholder}
        disabled={disabled}
        rows={3}
        autoFocus={autoFocus}
        className={className}
        aria-label={label}
      />
      <ChatBoxFooter>{footer}</ChatBoxFooter>
    </ChatBox>
  )
}
