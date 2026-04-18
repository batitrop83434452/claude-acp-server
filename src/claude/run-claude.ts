import * as readline from "node:readline";
import * as path from "node:path";
import { spawn } from "node:child_process";
import type { AgentSideConnection } from "@agentclientprotocol/sdk";
import type { ServerConfig } from "../config.js";
import { parseStreamJsonLine } from "./stream-json.js";

export type RunClaudeParams = {
  prompt: string;
  cwd: string;
  sessionId: string;
  isFirstPrompt: boolean;
  signal: AbortSignal;
  connection: AgentSideConnection;
};

function buildSpawnArgs(
  cfg: ServerConfig,
  params: RunClaudeParams,
): { cmd: string; args: string[] } {
  const args: string[] = [];
  if (cfg.claudeBin === "npx") {
    args.push("--yes", "@anthropic-ai/claude-code");
  }
  args.push(
    "-p",
    params.prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
  );
  if (params.isFirstPrompt) {
    args.push("--session-id", params.sessionId);
  } else {
    args.push("--resume", params.sessionId);
  }
  if (cfg.allowedTools?.length) {
    args.push("--allowed-tools", ...cfg.allowedTools);
  }
  if (cfg.disallowedTools?.length) {
    args.push("--disallowed-tools", ...cfg.disallowedTools);
  }
  if (cfg.permissionMode) {
    args.push("--permission-mode", cfg.permissionMode);
  }
  args.push(...cfg.claudeExtraArgs);

  const ext = path.extname(cfg.claudeBin);
  if (ext === ".mjs" || ext === ".js" || ext === ".cjs") {
    return { cmd: process.execPath, args: [cfg.claudeBin, ...args] };
  }

  const cmd = cfg.claudeBin === "npx" ? "npx" : cfg.claudeBin;
  return { cmd, args };
}

export async function runClaudeStreaming(
  cfg: ServerConfig,
  params: RunClaudeParams,
): Promise<{ stopReason: "end_turn" | "refusal" | "cancelled"; assistantText: string }> {
  const { cmd, args } = buildSpawnArgs(cfg, params);
  const child = spawn(cmd, args, {
    cwd: params.cwd,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const exitPromise = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (c, signal) => {
      resolve(c ?? (signal ? 1 : 0));
    });
  });

  const abortHandler = (): void => {
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 2000).unref();
  };
  if (params.signal.aborted) {
    abortHandler();
    return { stopReason: "cancelled", assistantText: "" };
  }
  params.signal.addEventListener("abort", abortHandler, { once: true });

  let assistantAggregate = "";
  let stopReason: "end_turn" | "refusal" | "cancelled" = "end_turn";
  let sawResult = false;

  const out = child.stdout;
  if (!out) throw new Error("claude process missing stdout");
  const rl = readline.createInterface({ input: out });
  try {
    for await (const line of rl) {
      if (params.signal.aborted) {
        stopReason = "cancelled";
        break;
      }
      const parsed = parseStreamJsonLine(params.sessionId, line);
      if (!parsed) continue;

      for (const u of parsed.updates) {
        await params.connection.sessionUpdate(u);
      }

      if (parsed.deltaText) {
        assistantAggregate += parsed.deltaText;
      }

      if (parsed.resultIsError) {
        stopReason = "refusal";
      }

      if (parsed.isResult) {
        sawResult = true;
        stopReason = parsed.resultIsError ? "refusal" : "end_turn";
      }
    }
  } finally {
    rl.close();
    params.signal.removeEventListener("abort", abortHandler);
  }

  let code: number;
  try {
    code = await exitPromise;
  } catch {
    return { stopReason: "refusal", assistantText: assistantAggregate };
  }

  if (params.signal.aborted) {
    return { stopReason: "cancelled", assistantText: assistantAggregate };
  }
  if (!sawResult && code !== 0) {
    stopReason = "refusal";
  }

  return { stopReason, assistantText: assistantAggregate };
}
