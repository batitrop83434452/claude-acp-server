#!/usr/bin/env node
import { applyServerWorkingDirectory, loadConfig, log } from "./config.js";
import { startStdioAgent } from "./transports/stdio.js";
import { startWebSocketAgent } from "./transports/websocket.js";
export { ACPServer } from "./server.js";
export { ClaudeAgent, PROTOCOL_VERSION } from "./claude-agent.js";
export type { ServerConfig } from "./config.js";
export {
  applyServerWorkingDirectory,
  defaultConfig,
  loadConfig,
} from "./config.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cfg = loadConfig(argv);
  applyServerWorkingDirectory(cfg.cwd);
  log(cfg, "debug", `config mode=${cfg.mode} cwd=${cfg.cwd}`);

  if (cfg.mode === "ws") {
    await startWebSocketAgent(cfg);
    return;
  }

  startStdioAgent(cfg);
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
