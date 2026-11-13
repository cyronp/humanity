import type { ToolRenderer } from "../registry.ts"
import { editRenderer, readRenderer } from "./files.tsx"
import {
  genericRenderer,
  mcpRenderer,
  questionRenderer,
  skillRenderer,
  subagentRenderer,
} from "./misc.tsx"
import { searchRenderer } from "./search.tsx"
import { shellRenderer } from "./shell.tsx"
import { threadRenderer } from "./thread.tsx"

/** Tried in order; the generic renderer at the end matches every tool. */
export const toolRenderers: ReadonlyArray<ToolRenderer> = [
  readRenderer,
  editRenderer,
  shellRenderer,
  searchRenderer,
  skillRenderer,
  subagentRenderer,
  questionRenderer,
  threadRenderer,
  mcpRenderer,
  genericRenderer,
]
