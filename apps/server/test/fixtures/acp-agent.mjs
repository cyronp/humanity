// A tiny ACP agent for the connection's tests: JSON-RPC 2.0, one message per line.
import process from "node:process"
import { createInterface } from "node:readline"

const send = (message) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`)

/** Requests this agent made of the client, by id, and what to do with the answer. */
const waiting = new Map()
let nextId = 100
/** What the client said about itself when it shook hands. */
let client

createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line)
  if (message.method === undefined) {
    waiting.get(message.id)?.(message)
    waiting.delete(message.id)
    return
  }
  switch (message.method) {
    case "initialize":
      client = message.params
      return send({
        id: message.id,
        result: {
          protocolVersion: message.params.protocolVersion,
          agentCapabilities: { loadSession: true },
          agentInfo: { name: "fixture", version: "1.2.3" },
        },
      })
    case "client":
      return send({ id: message.id, result: client })
    case "echo":
      return send({ id: message.id, result: message.params })
    case "fail":
      return send({ id: message.id, error: { code: -32000, message: "Sign in first." } })
    case "work": {
      // Two updates, a question for the client, then the answer: in that order.
      send({ method: "session/update", params: { step: 1 } })
      send({ method: "session/update", params: { step: 2 } })
      const id = `ask-${nextId++}`
      waiting.set(id, (answer) => {
        send({ method: "session/update", params: { answer: answer.result ?? answer.error } })
        send({ id: message.id, result: { done: true } })
      })
      return send({ id, method: message.params.ask, params: { toolCallId: "t1" } })
    }
    case "die":
      process.stderr.write("fatal: out of credits\n")
      return process.exit(3)
    case "ping":
      // A notification from the client: nothing to answer.
      return send({ method: "session/update", params: { pong: true } })
  }
})
