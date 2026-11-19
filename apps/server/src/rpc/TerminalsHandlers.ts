import { TerminalsRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { TerminalService } from "../terminal/TerminalService.ts"

export const TerminalsHandlers = TerminalsRpcs.toLayer(
  Effect.gen(function* () {
    const terminals = yield* TerminalService
    return TerminalsRpcs.of({
      "Terminals.list": ({ owner }) => terminals.list(owner),
      "Terminals.watch": ({ owner }) => terminals.watch(owner),
      "Terminals.open": ({ owner, shell }) => terminals.open(owner, { opener: "human", shell }),
      "Terminals.close": ({ terminalId }) => terminals.close(terminalId),
      "Terminals.rename": ({ terminalId, title }) => terminals.rename(terminalId, title),
      "Terminals.restart": ({ terminalId }) => terminals.restart(terminalId),
      "Terminals.attach": ({ terminalId, attachmentId, cols, rows }) =>
        terminals.attach(terminalId, attachmentId, { cols, rows }),
      "Terminals.write": ({ terminalId, data }) => terminals.write(terminalId, data),
      "Terminals.resize": ({ terminalId, cols, rows }) => terminals.resize(terminalId, cols, rows),
      "Terminals.ack": ({ terminalId, attachmentId, seq }) =>
        terminals.ack(terminalId, attachmentId, seq),
      "Terminals.shells": () => terminals.shells,
    })
  }),
)
