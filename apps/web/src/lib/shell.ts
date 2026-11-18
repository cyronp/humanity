export const isWindowsPath = (value: string): boolean => /^(?:[a-z]:[\\/]|\\\\)/i.test(value)

export const quotePosix = (value: string): string =>
  /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`

export const quotePowerShell = (value: string): string => `'${value.replaceAll("'", "''")}'`

export const callExecutable = (executable: string): string =>
  isWindowsPath(executable) ? `& ${quotePowerShell(executable)}` : quotePosix(executable)
