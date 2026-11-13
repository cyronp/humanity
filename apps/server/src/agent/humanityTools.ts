import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import {
  formatOpenedThread,
  HUMANITY_MCP_SERVER,
  OPEN_THREAD_TOOL_NAME,
  ReasoningEffort,
} from "@humanity/contracts"
import { Effect } from "effect"
import { z } from "zod"
import type { AgentRunOptions } from "./AgentRunner.ts"

const OPEN_THREAD_DESCRIPTION = `Opens a new thread in Humanity, in the same project as this one, and starts it on the given prompt. Use it when the human asks you to open, start or hand work to another thread, optionally on a specific model or reasoning effort.
The new thread is a separate conversation with its own agent: it sees nothing of this one, so the prompt must stand on its own (the problem, the files involved, what done looks like). It starts in the project's checkout, which this thread may also be working in. You are not told when it finishes or what it did.
The result gives you a markdown link to the new thread. Use it inline in your reply, where you mention the thread: the human sees it as the project's icon and the thread's title, and clicks it to go there.`

/**
 * Humanity's own MCP server, running inside the daemon. Its tools are named
 * `mcp__humanity__<tool>`.
 */
export const humanityMcpServer = (
  options: Pick<AgentRunOptions, "openThread">,
  run: <A>(effect: Effect.Effect<A>) => Promise<A>,
) =>
  createSdkMcpServer({
    name: HUMANITY_MCP_SERVER,
    version: "0.1.0",
    tools: [
      tool(
        OPEN_THREAD_TOOL_NAME,
        OPEN_THREAD_DESCRIPTION,
        {
          prompt: z
            .string()
            .describe("The new thread's first message: the whole task, self-contained."),
          title: z
            .string()
            .optional()
            .describe("A short title for the thread. Defaults to the prompt's first line."),
          model: z
            .string()
            .optional()
            .describe(
              "The model to run on. Prefer Claude Code's aliases: `opus`, `sonnet`, `haiku`, `fable`. A name with its version (`Haiku 5.5`, `claude-haiku-5-5`) is matched to what the account offers. Leave out for the human's default.",
            ),
          effort: z
            .enum(ReasoningEffort.literals)
            .optional()
            .describe("How hard the model reasons. Leave out for the model's default."),
        },
        (request) =>
          run(
            options.openThread(request).pipe(
              Effect.match({
                onSuccess: (thread) => ({
                  content: [{ type: "text" as const, text: formatOpenedThread(thread) }],
                }),
                onFailure: (error) => ({
                  content: [{ type: "text" as const, text: error.reason }],
                  isError: true,
                }),
              }),
            ),
          ),
      ),
    ],
  })
