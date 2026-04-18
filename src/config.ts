import * as fs from "node:fs";
import * as path from "node:path";

export type ServerConfig = {
  mode: "stdio" | "ws";
  port: number;
  host: string;
  cwd: string;
  logLevel: "debug" | "info" | "warn" | "error";
  sessionDir: string;
  maxSessions: number;
  claudeBin: string;
  claudeExtraArgs: string[];
  allowedTools?: string[];
  disallowedTools?: string[];
  permissionMode?: string;
};

export type UserFileConfig = {
  allowedTools?: string[];
  disallowedTools?: string[];
};

function take(argv: string[], i: number, flag: string): string {
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return v;
}

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

function parseArgs(argv: string[]): Partial<ServerConfig> & { _: string[] } {
  const out: Partial<ServerConfig> & { _: string[] } = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mode") {
      const m = take(argv, i, "--mode");
      if (m !== "stdio" && m !== "ws") {
        throw new Error(`Invalid --mode: ${m} (use stdio or ws)`);
      }
      out.mode = m;
      i++;
    } else if (a === "--port") {
      const p = Number(take(argv, i, "--port"));
      if (!Number.isInteger(p) || p < 1 || p > 65535) {
        throw new Error(`Invalid --port: must be an integer from 1 to 65535`);
      }
      out.port = p;
      i++;
    } else if (a === "--host") {
      out.host = take(argv, i, "--host");
      i++;
    } else if (a === "--cwd") {
      out.cwd = take(argv, i, "--cwd");
      i++;
    } else if (a === "--log-level") {
      const lv = take(argv, i, "--log-level");
      if (!LOG_LEVELS.includes(lv as (typeof LOG_LEVELS)[number])) {
        throw new Error(
          `Invalid --log-level: ${lv} (use ${LOG_LEVELS.join(", ")})`,
        );
      }
      out.logLevel = lv as ServerConfig["logLevel"];
      i++;
    } else if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
    else out._.push(a);
  }
  return out;
}

function readOptionalConfigFile(): UserFileConfig {
  const p = path.join(process.env.HOME ?? "", ".claude-acp", "config.json");
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw) as UserFileConfig;
  } catch {
    return {};
  }
}

function buildServerConfig(
  overrides: Partial<ServerConfig>,
  fileCfg: UserFileConfig,
): ServerConfig {
  const sessionDir =
    process.env.ACP_SESSION_DIR?.trim() ||
    path.join(process.env.HOME ?? process.cwd(), ".claude-acp", "sessions");

  const envAllowed = process.env.CLAUDE_CODE_ALLOWED_TOOLS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const envDisallowed = process.env.CLAUDE_CODE_DISALLOWED_TOOLS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allowedTools =
    envAllowed?.length ? envAllowed : fileCfg.allowedTools;
  const disallowedTools =
    envDisallowed?.length ? envDisallowed : fileCfg.disallowedTools;

  return {
    mode: overrides.mode ?? "stdio",
    port: overrides.port ?? 3000,
    host: overrides.host ?? "localhost",
    cwd: overrides.cwd ?? process.cwd(),
    logLevel: overrides.logLevel ?? "info",
    sessionDir,
    maxSessions:
      overrides.maxSessions ??
      (Number(process.env.ACP_MAX_SESSIONS ?? "10") || 10),
    claudeBin:
      overrides.claudeBin ??
      (process.env.CLAUDE_CODE_BIN?.trim() || "npx"),
    claudeExtraArgs:
      overrides.claudeExtraArgs ??
      process.env.CLAUDE_CODE_EXTRA_ARGS?.split(/\s+/).filter(Boolean) ??
      [],
    allowedTools: overrides.allowedTools ?? allowedTools,
    disallowedTools: overrides.disallowedTools ?? disallowedTools,
    permissionMode:
      overrides.permissionMode ?? process.env.CLAUDE_CODE_PERMISSION_MODE?.trim(),
  };
}

/** Environment + ~/.claude-acp/config.json + defaults (no CLI argv). */
export function defaultConfig(): ServerConfig {
  return buildServerConfig({}, readOptionalConfigFile());
}

export function loadConfig(argv: string[]): ServerConfig {
  const parsed = parseArgs(argv);
  const fileCfg = readOptionalConfigFile();
  return buildServerConfig(
    {
      mode: parsed.mode,
      port: parsed.port,
      host: parsed.host,
      cwd: parsed.cwd,
      logLevel: parsed.logLevel,
    },
    fileCfg,
  );
}

export function log(cfg: ServerConfig, level: ServerConfig["logLevel"], msg: string): void {
  const order = { debug: 0, info: 1, warn: 2, error: 3 };
  if (order[level] < order[cfg.logLevel]) return;
  process.stderr.write(`[claude-acp-server] ${level.toUpperCase()} ${msg}\n`);
}

/**
 * Applies `--cwd` / {@link ServerConfig.cwd} by changing this process’s working directory
 * before the ACP transport starts. Claude is still spawned with each session’s `cwd`
 * from `session/new` (ACP requires an absolute path there).
 */
export function applyServerWorkingDirectory(cwd: string): void {
  try {
    process.chdir(cwd);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Cannot use working directory ${cwd}: ${msg}`);
  }
}
