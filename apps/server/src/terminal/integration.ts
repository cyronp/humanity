import { posix, win32 } from "node:path"
import type { Shell } from "./shells.ts"

export const POWERSHELL_SCRIPT = `
if ($global:__HumanityIntegration) { return }
$global:__HumanityIntegration = $true
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  [Console]::InputEncoding = [System.Text.Encoding]::UTF8
} catch {}
$global:__HumanityPrompt = $function:prompt
$global:__HumanityLastHistory = $(Get-History -Count 1).Id
$global:__HumanityRan = $false
function global:prompt {
  $ok = $?
  $code = $global:LASTEXITCODE
  $e = [char]27
  $b = [char]7
  $marks = ""
  $last = $(Get-History -Count 1).Id
  $ran = $global:__HumanityRan -or ($null -ne $last -and $last -ne $global:__HumanityLastHistory)
  $global:__HumanityRan = $false
  $global:__HumanityLastHistory = $last
  if ($ran) {
    if ($ok) { $status = 0 } elseif ($code -is [int] -and $code -ne 0) { $status = $code } else { $status = 1 }
    $marks += "$e]133;D;$status$b"
  }
  $location = $executionContext.SessionState.Path.CurrentLocation
  if ($location.Provider.Name -eq "FileSystem") {
    $marks += "$e]7;file://$env:COMPUTERNAME/$($location.ProviderPath -replace '\\\\', '/')$b"
  }
  $marks += "$e]133;A$b"
  $shown = & $global:__HumanityPrompt
  $global:LASTEXITCODE = $code
  return "$marks$shown"
}
if (Test-Path Function:\\PSConsoleHostReadLine) {
  $global:__HumanityReadLine = $function:PSConsoleHostReadLine
  function global:PSConsoleHostReadLine {
    $line = & $global:__HumanityReadLine
    if ("$line".Trim().Length -gt 0) {
      $global:__HumanityRan = $true
      [Console]::Write("$([char]27)]133;C$([char]7)")
    }
    $line
  }
}
`

export const BASH_SCRIPT = `
if [ -n "\${HUMANITY_SHELL_LOGIN-}" ]; then
  unset HUMANITY_SHELL_LOGIN
  [ -r /etc/profile ] && . /etc/profile
  if [ -r "$HOME/.bash_profile" ]; then . "$HOME/.bash_profile"
  elif [ -r "$HOME/.bash_login" ]; then . "$HOME/.bash_login"
  elif [ -r "$HOME/.profile" ]; then . "$HOME/.profile"
  fi
else
  [ -r "$HOME/.bashrc" ] && . "$HOME/.bashrc"
fi

if [ -z "\${__humanity_integration-}" ]; then
  __humanity_integration=1
  __humanity_running=0
  __humanity_osc() { printf '\\033]%s\\007' "$1"; }
  __humanity_preexec() {
    [ "$__humanity_running" = 1 ] && return
    __humanity_running=1
    __humanity_osc "133;C"
  }
  __humanity_precmd() {
    local status=$?
    if [ "$__humanity_running" = 1 ]; then __humanity_osc "133;D;$status"; fi
    __humanity_running=0
    if [ -n "\${MSYSTEM-}" ]; then
      __humanity_osc "7;file://\${HOSTNAME-}/$(pwd -W 2>/dev/null)"
    else
      __humanity_osc "7;file://\${HOSTNAME-}$PWD"
    fi
    __humanity_osc "133;A"
    return $status
  }
  if [ -n "\${bash_preexec_imported-}" ]; then
    precmd_functions=(__humanity_precmd "\${precmd_functions[@]}")
    preexec_functions+=(__humanity_preexec)
  else
    __humanity_debug() {
      [ "$BASH_COMMAND" = "__humanity_prompt_start" ] && return
      [ -n "\${__humanity_in_prompt-}" ] && return
      [ -n "\${COMP_LINE-}" ] && return
      __humanity_preexec
    }
    __humanity_prompt_start() { __humanity_in_prompt=1; __humanity_precmd; local status=$?; return $status; }
    __humanity_prompt_end() { unset __humanity_in_prompt; }
    PROMPT_COMMAND="__humanity_prompt_start\${PROMPT_COMMAND:+;$PROMPT_COMMAND};__humanity_prompt_end"
    trap '__humanity_debug' DEBUG
  fi
fi
`

const ZSH_HOOKS = `
if [[ -z "\${__humanity_integration-}" ]]; then
  __humanity_integration=1
  __humanity_running=0
  __humanity_osc() { printf '\\e]%s\\a' "$1" }
  __humanity_precmd() {
    local exit_status=$?
    (( __humanity_running )) && __humanity_osc "133;D;$exit_status"
    __humanity_running=0
    __humanity_osc "7;file://\${HOST-}$PWD"
    __humanity_osc "133;A"
  }
  __humanity_preexec() {
    __humanity_running=1
    __humanity_osc "133;C"
  }
  precmd_functions=(__humanity_precmd $precmd_functions)
  preexec_functions+=(__humanity_preexec)
fi
`

const zshFile = (name: string, after = "") => `
__humanity_zdotdir="$ZDOTDIR"
ZDOTDIR="\${HUMANITY_USER_ZDOTDIR:-$HOME}"
[[ -r "$ZDOTDIR/${name}" ]] && . "$ZDOTDIR/${name}"
HUMANITY_USER_ZDOTDIR="$ZDOTDIR"
ZDOTDIR="$__humanity_zdotdir"
unset __humanity_zdotdir
${after}`

const ZSH_RESTORE = `
ZDOTDIR="$HUMANITY_USER_ZDOTDIR"
[[ "$ZDOTDIR" == "$HOME" ]] && unset ZDOTDIR
unset HUMANITY_USER_ZDOTDIR
`

export const ZSH_FILES: Readonly<Record<string, string>> = {
  ".zshenv": zshFile(".zshenv"),
  ".zprofile": zshFile(".zprofile"),
  ".zshrc": zshFile(".zshrc", `${ZSH_HOOKS}\n[[ -o login ]] || {${ZSH_RESTORE}}\n`),
  ".zlogin": zshFile(".zlogin", ZSH_RESTORE),
}

export const FISH_SCRIPT = `
if not set -q __humanity_integration
  set -g __humanity_integration 1
  function __humanity_osc
    printf '\\e]%s\\a' $argv[1]
  end
  function __humanity_preexec --on-event fish_preexec
    __humanity_osc "133;C"
  end
  function __humanity_postexec --on-event fish_postexec
    __humanity_osc "133;D;$status"
  end
  function __humanity_prompt --on-event fish_prompt
    __humanity_osc "7;file://$hostname$PWD"
    __humanity_osc "133;A"
  end
end
`

export const INTEGRATION_FILES: Readonly<Record<string, string>> = {
  "humanity.bash": BASH_SCRIPT,
  "humanity.fish": FISH_SCRIPT,
  ...Object.fromEntries(Object.entries(ZSH_FILES).map(([name, text]) => [`zsh/${name}`, text])),
}

export interface ShellLaunch {
  readonly args: ReadonlyArray<string>
  readonly env: Readonly<Record<string, string>>
  readonly integrated: boolean
}

export const encodePowerShell = (script: string) =>
  Buffer.from(script, "utf16le").toString("base64")

export const shellLaunch = (
  shell: Shell,
  options: {
    readonly platform: NodeJS.Platform
    readonly folder: string
    readonly env: Readonly<Record<string, string | undefined>>
  },
): ShellLaunch => {
  const { platform, folder, env } = options
  const path = platform === "win32" ? win32 : posix
  const file = (name: string) => path.join(folder, name).replaceAll("\\", "/")
  switch (shell.kind) {
    case "pwsh":
    case "powershell":
      return {
        args: ["-NoLogo", "-NoExit", "-EncodedCommand", encodePowerShell(POWERSHELL_SCRIPT)],
        env: {},
        integrated: true,
      }
    case "bash":
      return {
        args: ["--rcfile", file("humanity.bash"), "-i"],
        env:
          platform === "win32"
            ? { HUMANITY_SHELL_LOGIN: "1", CHERE_INVOKING: "1" }
            : { HUMANITY_SHELL_LOGIN: "1" },
        integrated: true,
      }
    case "zsh":
      return {
        args: ["-l"],
        env: {
          ZDOTDIR: path.join(folder, "zsh"),
          HUMANITY_USER_ZDOTDIR: env["ZDOTDIR"] ?? env["HOME"] ?? "",
        },
        integrated: true,
      }
    case "fish":
      return {
        args: ["-l", "--init-command", `source '${file("humanity.fish")}'`],
        env: {},
        integrated: true,
      }
    case "sh":
      return { args: ["-l"], env: {}, integrated: false }
    case "cmd":
    case "wsl":
      return { args: [], env: {}, integrated: false }
  }
}
