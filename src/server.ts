import type { ServerConfig } from "./config.js";
import { applyServerWorkingDirectory, defaultConfig } from "./config.js";
import { startStdioAgent } from "./transports/stdio.js";
import { startWebSocketAgent } from "./transports/websocket.js";

export type ACPServerOptions = Partial<ServerConfig>;

/**
 * Programmatic entry: start the Claude Code ACP bridge with the same options as the CLI.
 */
export class ACPServer {
  private readonly cfg: ServerConfig;

  constructor(opts: ACPServerOptions = {}) {
    const base = defaultConfig();
    this.cfg = { ...base, ...opts };
  }

  async start(): Promise<void> {
    applyServerWorkingDirectory(this.cfg.cwd);
    if (this.cfg.mode === "ws") {
      await startWebSocketAgent(this.cfg);
      return;
    }
    startStdioAgent(this.cfg);
  }
}
