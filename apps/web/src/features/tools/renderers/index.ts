import type { ToolRenderer } from "../registry.ts"
import { editRenderer, readRenderer } from "./files.tsx"
import {
  genericRenderer,
  mcpRenderer,
  questionRenderer,
  skillRenderer,
  subagentRenderer,
} from "./misc.tsx"
import { patchRenderer } from "./patch.tsx"
import { searchRenderer } from "./search.tsx"
import { shellRenderer } from "./shell.tsx"
import { threadRenderer } from "./thread.tsx"

export const toolRenderers: ReadonlyArray<ToolRenderer> = [
  readRenderer,
  editRenderer,
  patchRenderer,
  shellRenderer,
  searchRenderer,
  skillRenderer,
  subagentRenderer,
  questionRenderer,
  threadRenderer,
  mcpRenderer,
  genericRenderer,
]
