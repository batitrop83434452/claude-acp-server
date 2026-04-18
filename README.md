# claude-acp-server

**Agent Client Protocol (ACP) bridge for [Claude Code](https://docs.anthropic.com/claude-code)** — run JSON-RPC over **stdio** (default) or **WebSocket**, and drive the `claude` CLI in `--print` mode with **`stream-json`** output mapped to ACP `session/update` notifications.

This project implements the agent side using the official [`@agentclientprotocol/sdk`](https://www.npmjs.com/package/@agentclientprotocol/sdk), so it tracks the [Agent Client Protocol](https://agentclientprotocol.com) (protocol version **1**).

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-2.1-3178C6)](https://docs.anthropic.com/claude-code)
[![ACP](https://img.shields.io/badge/ACP-protocol%201-FF6B6B)](https://agentclientprotocol.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20.18+-green)](https://nodejs.org/)

## What is this?

Editors that speak ACP (for example [Zed](https://zed.dev)) expect a subprocess or socket that exchanges **newline-delimited JSON-RPC** messages. This server is that subprocess: it translates ACP methods (`initialize`, `session/new`, `session/prompt`, …) into **Claude Code** invocations with `-p` / `--resume`, streams NDJSON from `--output-format stream-json --verbose --include-partial-messages`, and forwards text and tool events to the client as **`session/update`** notifications.

You need a working Claude Code install and authentication (`claude` on `PATH`, or `npx @anthropic-ai/claude-code`, per your setup).

## Install

```bash
git clone <your-repo-url> claude-acp-server
cd claude-acp-server
npm install
npm run build
```

## Quick start (stdio)

```bash
npm start
```

The process reads JSON-RPC from **stdin** and writes responses to **stdout**. Log lines go to **stderr** (ACP requires stdout to contain only protocol messages).

When the package is installed globally or linked from a clone (`npm link` after `npm run build`), the same entry is available as the **`claude-acp-server`** command (see `bin` in `package.json`).

### WebSocket

```bash
npm run start:ws -- --port 3000 --host 0.0.0.0
```

The WebSocket transport uses the same newline-delimited JSON-RPC framing as stdio (one JSON object per message). A single connection can handle multiple ACP sessions via `session/new` and `session/load`, the same as stdio.

### CLI flags

| Flag | Description | Default |
|------|-------------|---------|
| `--mode` | `stdio` or `ws` | `stdio` |
| `--port` | WebSocket port | `3000` |
| `--host` | WebSocket bind address | `localhost` |
| `--cwd` | Server process working directory (`process.chdir` before ACP starts) | `process.cwd()` |
| `--log-level` | `debug`, `info`, `warn`, `error` | `info` |

Each `session/new` still sends its own absolute workspace `cwd`; that value is what Claude Code uses when spawned, not only this flag.

## Editor configuration

### Zed (`settings.json`)

Use the absolute path to the built `dist/index.js` (or `node` + path to the repo):

```json
{
  "assistant": {
    "acp": {
      "servers": [
        {
          "name": "Claude Code",
          "command": "node",
          "args": ["/absolute/path/to/claude-acp-server/dist/index.js"],
          "env": {
            "CLAUDE_CODE_ALLOWED_TOOLS": "Read,Grep,Bash"
          }
        }
      ]
    }
  }
}
```

### VS Code

Install an ACP client extension (for example the [ACP Client](https://marketplace.visualstudio.com/items?itemName=agentclientprotocol.acp) from the marketplace), then point it at the same `node dist/index.js` command.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `CLAUDE_CODE_ALLOWED_TOOLS` | Passed to `--allowed-tools` |
| `CLAUDE_CODE_DISALLOWED_TOOLS` | Passed to `--disallowed-tools` |
| `CLAUDE_CODE_PERMISSION_MODE` | Passed to `--permission-mode` |
| `CLAUDE_CODE_BIN` | Executable: `npx` (default), `claude`, or a path to a `.mjs` / `.js` script (see below) |
| `CLAUDE_CODE_EXTRA_ARGS` | Extra CLI tokens appended after the built-in flags |
| `ACP_SESSION_DIR` | Directory for session metadata and transcripts (default: `~/.claude-acp/sessions`) |
| `ACP_MAX_SESSIONS` | Cap on concurrent sessions (default: `10`) |

Optional file: `~/.claude-acp/config.json` may define `allowedTools` and `disallowedTools` (used when the env vars are unset). See `.env.example`.

### Custom Node runner (advanced)

If `CLAUDE_CODE_BIN` is set to a `.mjs` / `.js` / `.cjs` file, the server runs `node <that-file> -p …` with the same flags as the real CLI. This is useful for tests or custom wrappers.

## Repository layout

```
claude-acp-server/
├── src/
│   ├── index.ts              # CLI entry, exports
│   ├── server.ts             # ACPServer class
│   ├── config.ts             # Env, ~/.claude-acp/config.json, CLI flags
│   ├── claude-agent.ts       # ACP Agent → Claude Code
│   ├── session-store.ts      # Session metadata + transcripts
│   ├── claude/
│   │   ├── run-claude.ts     # Spawn CLI, NDJSON stdout
│   │   ├── stream-json.ts    # Claude lines → session/update
│   │   └── prompt-text.ts    # Content blocks → prompt string
│   └── transports/
│       ├── stdio.ts
│       └── websocket.ts
├── tests/
├── dist/                     # `npm run build` (removed by `npm run clean`)
├── tsconfig.json
├── vitest.config.ts
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── LICENSE
```

## Architecture

```
Editor (ACP client)
    │  JSON-RPC (NDJSON over stdio or WebSocket)
    ▼
@agentclientprotocol/sdk  →  ClaudeAgent  →  spawn Claude Code (-p, stream-json)
    │                                              │
    └──────── session/update notifications ◄────────┘
```

- **Sessions**: Each ACP `sessionId` is a UUID. The first prompt uses `--session-id`; later prompts use `--resume` with the same id.
- **Transcripts**: User and assistant text are appended under `ACP_SESSION_DIR` so `session/load` can replay history via `session/update` (when supported by the client).

## Implemented ACP surface

| Method | Notes |
|--------|--------|
| `initialize` | Negotiates protocol version and capabilities (`loadSession`, prompt content). |
| `authenticate` | No-op success (no auth flow in this bridge). |
| `session/new` | Creates session, persists metadata. |
| `session/load` | Replays stored transcript when present. |
| `session/prompt` | Runs Claude Code; streams chunks; returns `stopReason`. |
| `session/cancel` | Aborts the in-flight CLI process. |
| `session/set_mode` | Acknowledged (no-op). |

Tool permission prompts are handled inside Claude Code; this bridge does not forward interactive permission UI to the editor unless extended to do so.

## Programmatic API

```typescript
import { ACPServer } from "claude-acp-server";

const server = new ACPServer({
  mode: "stdio",
  cwd: "/path/to/project",
  allowedTools: ["Read", "Grep"],
});

await server.start();
```

`ACPServer.start()` applies `cwd` with `process.chdir` (same as the CLI `--cwd` flag).

## Testing

```bash
npm test
```

Full compile + test (recommended before commits or CI):

```bash
npm run build && npm test
```

Tests cover CLI/config parsing, stream-json mapping, prompt text from content blocks, and an end-to-end ACP handshake using a tiny fake Claude script (no API or `claude` binary required).

Development: `npm run clean` deletes `dist/`; `npm run dev` runs the TypeScript entry with watch. Vitest runs test **files** sequentially so `process.chdir` in config tests does not race other suites.

## Docker (example)

```dockerfile
FROM node:22-alpine
RUN npm install -g @anthropic-ai/claude-code
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/index.js", "--mode", "ws", "--host", "0.0.0.0", "--port", "3000"]
```

## References

- [Agent Client Protocol](https://agentclientprotocol.com)
- [TypeScript SDK](https://github.com/agentclientprotocol/typescript-sdk)
- [Claude Code documentation](https://docs.anthropic.com/claude-code)

## License

See [LICENSE](LICENSE) (MIT).
