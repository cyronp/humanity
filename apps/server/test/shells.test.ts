import { assert, describe, it } from "@effect/vitest"
import type { LocateOptions } from "../src/agent/installedCli.ts"
import { detectShells, pickShell, shellArgs } from "../src/terminal/shells.ts"

const machine = (
  platform: NodeJS.Platform,
  files: ReadonlyArray<string>,
  env: Record<string, string>,
  etcShells?: string,
): LocateOptions => ({
  platform,
  env,
  home: platform === "win32" ? "C:\\Users\\me" : "/home/me",
  exists: (path) => files.includes(path),
  readFile: (path) => (path === "/etc/shells" ? etcShells : undefined),
})

describe("detectShells", () => {
  it("finds PowerShell first on Windows, and Git Bash beside git, not WSL's bash", () => {
    const shells = detectShells(
      machine(
        "win32",
        [
          "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
          "C:\\Windows\\System32\\bash.exe",
          "C:\\Windows\\System32\\wsl.exe",
          "C:\\Program Files\\Git\\cmd\\git.exe",
          "C:\\Program Files\\Git\\bin\\bash.exe",
          "C:\\Windows\\System32\\cmd.exe",
        ],
        {
          PATH: "C:\\Windows\\System32;C:\\Windows\\System32\\WindowsPowerShell\\v1.0;C:\\Program Files\\Git\\cmd",
          PATHEXT: ".EXE",
          COMSPEC: "C:\\Windows\\System32\\cmd.exe",
        },
      ),
    )
    assert.deepStrictEqual(
      shells.map((shell) => [shell.id, shell.path]),
      [
        ["powershell", "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"],
        ["git-bash", "C:\\Program Files\\Git\\bin\\bash.exe"],
        ["cmd", "C:\\Windows\\System32\\cmd.exe"],
        ["wsl", "C:\\Windows\\System32\\wsl.exe"],
      ],
    )
  })

  it("puts $SHELL first elsewhere, then the other shells of /etc/shells once each", () => {
    const shells = detectShells(
      machine(
        "linux",
        ["/usr/bin/zsh", "/bin/bash", "/usr/bin/bash", "/bin/sh", "/usr/bin/fish"],
        { SHELL: "/usr/bin/zsh" },
        "# comment\n/bin/sh\n/bin/bash\n/usr/bin/bash\n/usr/bin/zsh\n/usr/bin/fish\n/bin/missing\n",
      ),
    )
    assert.deepStrictEqual(
      shells.map((shell) => [shell.id, shell.path]),
      [
        ["zsh", "/usr/bin/zsh"],
        ["sh", "/bin/sh"],
        ["bash", "/bin/bash"],
        ["fish", "/usr/bin/fish"],
      ],
    )
  })
})

describe("pickShell", () => {
  const shells = detectShells(
    machine("linux", ["/bin/bash", "/usr/bin/fish"], { SHELL: "/bin/bash" }, "/usr/bin/fish\n"),
  )

  it("takes the shell asked for, else the default", () => {
    assert.strictEqual(pickShell(shells, "fish")?.id, "fish")
    assert.strictEqual(pickShell(shells, null)?.id, "bash")
    assert.strictEqual(pickShell(shells, "pwsh")?.id, "bash")
    assert.isUndefined(pickShell([], null))
  })

  it("starts login shells, and Git Bash interactive", () => {
    const bash = pickShell(shells, "bash")
    if (bash === undefined) return assert.fail("bash")
    assert.deepStrictEqual(shellArgs(bash, "linux"), ["-l"])
    assert.deepStrictEqual(shellArgs(bash, "win32"), ["--login", "-i"])
  })
})
