import { ProjectsRpcs } from "./rpc/Projects.ts"

/** Every RPC the daemon serves, merged into the single group the socket speaks. */
export const HumanityRpcs = ProjectsRpcs

/** Path of the RPC WebSocket on the daemon (and on the Vite dev proxy). */
export const RPC_PATH = "/rpc"

/** Query parameter carrying the daemon auth token on the WebSocket URL. */
export const TOKEN_PARAM = "token"

export const DEFAULT_DAEMON_PORT = 7420
