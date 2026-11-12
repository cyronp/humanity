import { type Dispatch, type SetStateAction, useRef } from "react"
import { applyInsertion, type PromptInsertion } from "./prompt.ts"

/**
 * Puts a skill, an MCP server or a diff reference into a message box, then
 * gives the box back its focus with the caret after what was inserted.
 */
export function usePromptInsert(text: string, setText: Dispatch<SetStateAction<string>>) {
  const textarea = useRef<HTMLTextAreaElement>(null)

  const insert = (insertion: PromptInsertion) => {
    const element = textarea.current
    const selection = {
      start: element?.selectionStart ?? text.length,
      end: element?.selectionEnd ?? text.length,
    }
    const edit = applyInsertion(text, insertion, selection)
    setText(edit.text)
    // After React has rendered the new text and the menu has closed.
    requestAnimationFrame(() => {
      const box = textarea.current
      if (box === null) return
      box.focus()
      box.setSelectionRange(edit.caret, edit.caret)
    })
  }

  return { textarea, insert }
}
