import { describe, expect, it } from "vitest"
import {
  ancestorIn,
  descendantsOf,
  framingOf,
  parseLsof,
  parseNetstat,
  parseProcesses,
  parseSs,
} from "../src/preview/listeners.ts"

const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
})

describe("parseNetstat", () => {
  it("reads listening rows by their foreign address, whatever the language", () => {
    const text = [
      "",
      "Conexões ativas",
      "",
      "  Proto  Endereço local         Endereço externo       Estado           PID",
      "  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1520",
      "  TCP    127.0.0.1:5173         0.0.0.0:0              ABHÖREN         9001",
      "  TCP    127.0.0.1:5173         127.0.0.1:61000        ESTABLISHED     9001",
      "  TCP    192.168.1.5:139        0.0.0.0:0              LISTENING       4",
      "  TCP    [::1]:3000             [::]:0                 LISTENING       42",
    ].join("\r\n")
    expect(parseNetstat(text)).toEqual([
      { host: "0.0.0.0", port: 135, pid: 1520 },
      { host: "127.0.0.1", port: 5173, pid: 9001 },
      { host: "192.168.1.5", port: 139, pid: 4 },
      { host: "::1", port: 3000, pid: 42 },
    ])
  })
})

describe("parseLsof", () => {
  it("reads each process's listening addresses", () => {
    const text = [
      "p501",
      "cnode",
      "n127.0.0.1:5173",
      "n[::1]:5173",
      "p77",
      "cpython3",
      "n*:8000",
    ].join("\n")
    expect(parseLsof(text)).toEqual([
      { host: "127.0.0.1", port: 5173, pid: 501, processName: "node" },
      { host: "::1", port: 5173, pid: 501, processName: "node" },
      { host: "*", port: 8000, pid: 77, processName: "python3" },
    ])
  })
})

describe("parseSs", () => {
  it("reads the address and the first process of each row", () => {
    const text = [
      'LISTEN 0      511        127.0.0.1:5173       0.0.0.0:*    users:(("node",pid=1234,fd=20))',
      'LISTEN 0      4096               *:8080             *:*    users:(("python3",pid=55,fd=3))',
      "LISTEN 0      128        0.0.0.0:22         0.0.0.0:*",
    ].join("\n")
    expect(parseSs(text)).toEqual([
      { host: "127.0.0.1", port: 5173, pid: 1234, processName: "node" },
      { host: "*", port: 8080, pid: 55, processName: "python3" },
    ])
  })
})

describe("processes", () => {
  const rows = parseProcesses(
    [
      "    1     0 /sbin/launchd",
      "  100     1 pwsh.exe",
      "  200   100 node.exe",
      "  300   200 System Idle Process",
    ].join("\n"),
  )

  it("reads ids, parents and base names", () => {
    expect(rows[0]).toEqual({ pid: 1, ppid: 0, name: "launchd" })
    expect(rows[3]).toEqual({ pid: 300, ppid: 200, name: "System Idle Process" })
  })

  it("finds the terminal a process descends from", () => {
    const parents = new Map(rows.map((row) => [row.pid, row.ppid]))
    expect(ancestorIn(300, parents, new Map([[100, "terminal-1"]]))).toBe("terminal-1")
    expect(ancestorIn(300, parents, new Map([[999, "terminal-2"]]))).toBeUndefined()
  })

  it("lists a process tree", () => {
    expect(descendantsOf(100, rows)).toEqual([100, 200, 300])
  })
})

describe("framingOf", () => {
  const app = "http://127.0.0.1:7420"

  it("lets a page without framing headers be framed", () => {
    expect(framingOf(headers({}), app)).toBeUndefined()
  })

  it("explains X-Frame-Options", () => {
    expect(framingOf(headers({ "x-frame-options": "sameorigin" }), app)).toMatch(/SAMEORIGIN/)
  })

  it("reads frame-ancestors, which wins over X-Frame-Options", () => {
    expect(
      framingOf(
        headers({ "content-security-policy": "default-src 'self'; frame-ancestors 'none'" }),
        app,
      ),
    ).toMatch(/frame-ancestors 'none'/)
    expect(
      framingOf(headers({ "content-security-policy": "frame-ancestors 'self'" }), app),
    ).toBeDefined()
    expect(
      framingOf(
        headers({
          "content-security-policy": "frame-ancestors http://127.0.0.1:*",
          "x-frame-options": "DENY",
        }),
        app,
      ),
    ).toBeUndefined()
    expect(
      framingOf(headers({ "content-security-policy": "frame-ancestors *" }), app),
    ).toBeUndefined()
  })
})
