# Security policy

Humanity runs a local daemon that lets a coding agent read files, edit files and run commands on your machine, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub:
<https://github.com/cyronp/humanity/security/advisories/new>

Include what you found, how to reproduce it and what an attacker could do with it. You can expect a first answer within a few days.

## Supported versions

Only the latest release and the `main` branch receive security fixes.

## Security model

- The daemon binds to `127.0.0.1` only and refuses WebSocket connections without the token in `~/.humanity/auth-token`. Treat that token like a password.
- Never expose the daemon's port to a network without putting your own authenticated, encrypted tunnel in front of it.
- Threads in **Auto mode** run commands and edit files without asking. Use **Ask me** for repositories or tasks you do not trust.
- Humanity never uses the Agent SDK's `bypassPermissions` mode, and never writes outside `~/.humanity/` or the folder a session works in.
- API keys and tokens are never stored in the database.
