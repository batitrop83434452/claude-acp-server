import { AgentSideConnection, ndJsonStream } from "@agentclientprotocol/sdk";
import { WebSocketServer, type RawData } from "ws";
import type { ServerConfig } from "../config.js";
import { log } from "../config.js";
import { ClaudeAgent } from "../claude-agent.js";

function rawDataToUint8(data: RawData): Uint8Array {
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  if (typeof data === "string") return new Uint8Array(Buffer.from(data, "utf8"));
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Uint8Array) return new Uint8Array(data);
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (ArrayBuffer.isView(data)) {
    const v = data as ArrayBufferView;
    return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  }
  throw new TypeError("Unsupported WebSocket message payload type");
}

export function startWebSocketAgent(cfg: ServerConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ host: cfg.host, port: cfg.port }, () => {
      log(
        cfg,
        "info",
        `WebSocket ACP listening on ws://${cfg.host}:${cfg.port}`,
      );
      resolve();
    });
    wss.on("error", reject);

    wss.on("connection", (ws) => {
      const outbound = new WritableStream<Uint8Array>({
        write(chunk) {
          return new Promise((res, rej) => {
            ws.send(Buffer.from(chunk), (err) => (err ? rej(err) : res()));
          });
        },
      });
      const inbound = new ReadableStream<Uint8Array>({
        start(controller) {
          ws.on("message", (data: RawData) => {
            const u = rawDataToUint8(data);
            controller.enqueue(u);
          });
          ws.on("close", () => controller.close());
          ws.on("error", (e) => controller.error(e));
        },
      });
      const stream = ndJsonStream(outbound, inbound);
      new AgentSideConnection((c) => new ClaudeAgent(c, cfg), stream);
    });
  });
}
