import { Readable, Writable } from "node:stream";
import { AgentSideConnection, ndJsonStream } from "@agentclientprotocol/sdk";
import type { ServerConfig } from "../config.js";
import { ClaudeAgent } from "../claude-agent.js";

export function startStdioAgent(cfg: ServerConfig): void {
  const stream = ndJsonStream(
    Writable.toWeb(process.stdout),
    Readable.toWeb(process.stdin),
  );
  new AgentSideConnection((c) => new ClaudeAgent(c, cfg), stream);
}
