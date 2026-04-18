import { describe, expect, it } from "vitest";
import {
  AgentSideConnection,
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { ClaudeAgent } from "../src/claude-agent.js";
import type { ServerConfig } from "../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("ACP in-memory with fake Claude", () => {
  it("initialize → session/new → session/prompt", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "acp-"));
    const cfg: ServerConfig = {
      mode: "stdio",
      port: 0,
      host: "127.0.0.1",
      cwd: tmp,
      logLevel: "error",
      sessionDir: path.join(tmp, "sessions"),
      maxSessions: 10,
      claudeBin: path.join(__dirname, "fixtures", "fake-claude.mjs"),
      claudeExtraArgs: [],
    };

    const clientToAgent = new TransformStream<Uint8Array, Uint8Array>();
    const agentToClient = new TransformStream<Uint8Array, Uint8Array>();

    const agentStream = ndJsonStream(agentToClient.writable, clientToAgent.readable);
    new AgentSideConnection((c) => new ClaudeAgent(c, cfg), agentStream);

    class TestClient {
      async sessionUpdate() {
        /* drain notifications */
      }
      async requestPermission() {
        return {
          outcome: { outcome: "selected" as const, optionId: "allow" },
        };
      }
    }

    const clientStream = ndJsonStream(clientToAgent.writable, agentToClient.readable);
    const client = new ClientSideConnection(() => new TestClient(), clientStream);

    const init = await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
    });
    expect(init.protocolVersion).toBe(PROTOCOL_VERSION);

    const { sessionId } = await client.newSession({
      cwd: tmp,
      mcpServers: [],
    });

    const pr = await client.prompt({
      sessionId,
      prompt: [{ type: "text", text: "hi" }],
    });
    expect(pr.stopReason).toBe("end_turn");
  });
});
