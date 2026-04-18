import type { Agent, AgentSideConnection } from "@agentclientprotocol/sdk";
import {
  PROTOCOL_VERSION,
  RequestError,
} from "@agentclientprotocol/sdk";
import type {
  AuthenticateRequest,
  AuthenticateResponse,
  CancelNotification,
  InitializeRequest,
  InitializeResponse,
  LoadSessionRequest,
  LoadSessionResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  SessionNotification,
  SetSessionModeRequest,
  SetSessionModeResponse,
} from "@agentclientprotocol/sdk";
import * as crypto from "node:crypto";
import type { ServerConfig } from "./config.js";
import { log } from "./config.js";
import { contentBlocksToPromptText } from "./claude/prompt-text.js";
import { runClaudeStreaming } from "./claude/run-claude.js";
import {
  appendTranscript,
  bumpPromptCount,
  countSessions,
  loadSessionMeta,
  loadTranscript,
  saveSessionMeta,
  type SessionMeta,
} from "./session-store.js";

type SessionState = {
  meta: SessionMeta;
  pendingPrompt: AbortController | null;
};

export class ClaudeAgent implements Agent {
  private readonly sessions = new Map<string, SessionState>();

  constructor(
    private readonly connection: AgentSideConnection,
    private readonly cfg: ServerConfig,
  ) {}

  async initialize(params: InitializeRequest): Promise<InitializeResponse> {
    const v = params.protocolVersion;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
      throw RequestError.invalidParams(
        undefined,
        "protocolVersion must be a positive integer",
      );
    }
    const protocolVersion = v > PROTOCOL_VERSION ? PROTOCOL_VERSION : v;
    return {
      protocolVersion,
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: {
          image: false,
          audio: false,
          embeddedContext: true,
        },
      },
      agentInfo: {
        name: "claude-acp-server",
        title: "Claude Code (ACP)",
        version: "1.0.0",
      },
      authMethods: [],
    };
  }

  async authenticate(_params: AuthenticateRequest): Promise<AuthenticateResponse> {
    return {};
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    if (countSessions(this.cfg) >= this.cfg.maxSessions) {
      throw RequestError.internalError(
        undefined,
        `Maximum concurrent sessions (${this.cfg.maxSessions}) reached`,
      );
    }
    const sessionId = crypto.randomUUID();
    const meta: SessionMeta = {
      sessionId,
      cwd: params.cwd,
      promptCount: 0,
      createdAt: new Date().toISOString(),
    };
    saveSessionMeta(this.cfg, meta);
    this.sessions.set(sessionId, { meta, pendingPrompt: null });
    log(this.cfg, "info", `session/new ${sessionId} cwd=${params.cwd}`);
    return { sessionId };
  }

  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    const meta = loadSessionMeta(this.cfg, params.sessionId);
    if (!meta) {
      throw RequestError.resourceNotFound(params.sessionId);
    }
    const transcript = loadTranscript(this.cfg, params.sessionId);
    const userTurns = transcript.filter((t) => t.role === "user").length;
    meta.promptCount = userTurns;
    saveSessionMeta(this.cfg, meta);

    for (const turn of transcript) {
      const update: SessionNotification =
        turn.role === "user"
          ? {
              sessionId: params.sessionId,
              update: {
                sessionUpdate: "user_message_chunk",
                content: { type: "text", text: turn.text },
              },
            }
          : {
              sessionId: params.sessionId,
              update: {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: turn.text },
              },
            };
      await this.connection.sessionUpdate(update);
    }
    this.sessions.set(params.sessionId, { meta, pendingPrompt: null });
    log(
      this.cfg,
      "info",
      `session/load ${params.sessionId} replayed=${transcript.length} chunks`,
    );
    return {};
  }

  async setSessionMode(_params: SetSessionModeRequest): Promise<SetSessionModeResponse> {
    return {};
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    let state = this.sessions.get(params.sessionId);
    if (!state) {
      const meta = loadSessionMeta(this.cfg, params.sessionId);
      if (!meta) {
        throw RequestError.resourceNotFound(params.sessionId);
      }
      state = { meta, pendingPrompt: null };
      this.sessions.set(params.sessionId, state);
    }

    state.pendingPrompt?.abort();
    const ac = new AbortController();
    state.pendingPrompt = ac;

    const promptText = contentBlocksToPromptText(params.prompt);
    const isFirstPrompt = state.meta.promptCount === 0;

    try {
      const { stopReason, assistantText } = await runClaudeStreaming(this.cfg, {
        prompt: promptText,
        cwd: state.meta.cwd,
        sessionId: state.meta.sessionId,
        isFirstPrompt,
        signal: ac.signal,
        connection: this.connection,
      });

      state.meta = bumpPromptCount(this.cfg, state.meta.sessionId);

      appendTranscript(this.cfg, state.meta.sessionId, [
        { role: "user", text: promptText },
        { role: "assistant", text: assistantText },
      ]);

      const sr =
        stopReason === "cancelled"
          ? "cancelled"
          : stopReason === "refusal"
            ? "refusal"
            : "end_turn";

      return { stopReason: sr };
    } catch (e) {
      if (ac.signal.aborted) {
        return { stopReason: "cancelled" };
      }
      throw e;
    } finally {
      state.pendingPrompt = null;
    }
  }

  async cancel(params: CancelNotification): Promise<void> {
    this.sessions.get(params.sessionId)?.pendingPrompt?.abort();
  }
}

export { PROTOCOL_VERSION };
