import * as fs from "node:fs";
import * as path from "node:path";
import type { ServerConfig } from "./config.js";

export type TranscriptEntry =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string };

export type SessionMeta = {
  sessionId: string;
  cwd: string;
  promptCount: number;
  createdAt: string;
};

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function metaPath(sessionDir: string, sessionId: string): string {
  return path.join(sessionDir, `${sessionId}.json`);
}

function transcriptPath(sessionDir: string, sessionId: string): string {
  return path.join(sessionDir, `${sessionId}.transcript.json`);
}

export function loadSessionMeta(
  cfg: ServerConfig,
  sessionId: string,
): SessionMeta | undefined {
  const p = metaPath(cfg.sessionDir, sessionId);
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as SessionMeta;
  } catch {
    return undefined;
  }
}

export function saveSessionMeta(cfg: ServerConfig, meta: SessionMeta): void {
  ensureDir(cfg.sessionDir);
  fs.writeFileSync(metaPath(cfg.sessionDir, meta.sessionId), JSON.stringify(meta, null, 2), "utf8");
}

export function bumpPromptCount(cfg: ServerConfig, sessionId: string): SessionMeta {
  const cur = loadSessionMeta(cfg, sessionId);
  if (!cur) throw new Error(`Session ${sessionId} not found`);
  const next = { ...cur, promptCount: cur.promptCount + 1 };
  saveSessionMeta(cfg, next);
  return next;
}

export function appendTranscript(
  cfg: ServerConfig,
  sessionId: string,
  entries: TranscriptEntry[],
): void {
  const p = transcriptPath(cfg.sessionDir, sessionId);
  let existing: TranscriptEntry[] = [];
  try {
    existing = JSON.parse(fs.readFileSync(p, "utf8")) as TranscriptEntry[];
  } catch {
    existing = [];
  }
  fs.writeFileSync(p, JSON.stringify([...existing, ...entries], null, 2), "utf8");
}

export function loadTranscript(
  cfg: ServerConfig,
  sessionId: string,
): TranscriptEntry[] {
  try {
    return JSON.parse(
      fs.readFileSync(transcriptPath(cfg.sessionDir, sessionId), "utf8"),
    ) as TranscriptEntry[];
  } catch {
    return [];
  }
}

export function countSessions(cfg: ServerConfig): number {
  try {
    return fs.readdirSync(cfg.sessionDir).filter((f) => f.endsWith(".json") && !f.endsWith(".transcript.json")).length;
  } catch {
    return 0;
  }
}
