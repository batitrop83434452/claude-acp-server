import type { SessionNotification } from "@agentclientprotocol/sdk";

export type StreamLineResult = {
  updates: SessionNotification[];
  /** Plain text contributed by this line (for transcript) */
  deltaText: string;
  isResult: boolean;
  resultIsError: boolean;
};

function chunkToUpdates(sessionId: string, text: string): SessionNotification[] {
  if (!text) return [];
  return [
    {
      sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text },
      },
    },
  ];
}

/**
 * Maps Claude Code `--output-format stream-json` (NDJSON) lines to ACP `session/update` payloads.
 */
export function parseStreamJsonLine(
  sessionId: string,
  line: string,
): StreamLineResult | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  let rec: Record<string, unknown>;
  try {
    rec = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return undefined;
  }

  const type = rec.type as string | undefined;

  if (type === "system" && rec.subtype === "init") {
    return { updates: [], deltaText: "", isResult: false, resultIsError: false };
  }

  if (type === "stream_event") {
    const event = rec.event as Record<string, unknown> | undefined;
    const delta = event?.delta as Record<string, unknown> | undefined;
    if (delta?.type === "text_delta" && typeof delta.text === "string") {
      const t = delta.text as string;
      return {
        updates: chunkToUpdates(sessionId, t),
        deltaText: t,
        isResult: false,
        resultIsError: false,
      };
    }
    return undefined;
  }

  if (type === "assistant") {
    if (rec.error) {
      const msg = rec.message as Record<string, unknown> | undefined;
      const content = msg?.content as unknown;
      let text = `Error: ${String(rec.error)}`;
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as Record<string, unknown>;
          if (b.type === "text" && typeof b.text === "string") {
            text = b.text as string;
          }
        }
      }
      return {
        updates: chunkToUpdates(sessionId, text),
        deltaText: text,
        isResult: false,
        resultIsError: true,
      };
    }
    const msg = rec.message as Record<string, unknown> | undefined;
    const content = msg?.content as unknown;
    const updates: SessionNotification[] = [];
    let deltaText = "";
    if (Array.isArray(content)) {
      for (const block of content) {
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          deltaText += b.text;
          updates.push(...chunkToUpdates(sessionId, b.text as string));
        } else if (b.type === "tool_use") {
          const id = String(b.id ?? `tool_${Date.now()}`);
          updates.push({
            sessionId,
            update: {
              sessionUpdate: "tool_call",
              toolCallId: id,
              title: String(b.name ?? "tool"),
              kind: "other",
              status: "pending",
              rawInput: b.input,
            },
          });
        }
      }
    }
    if (updates.length === 0) return undefined;
    return {
      updates,
      deltaText,
      isResult: false,
      resultIsError: false,
    };
  }

  if (type === "result") {
    return {
      updates: [],
      deltaText: "",
      isResult: true,
      resultIsError: Boolean(rec.is_error),
    };
  }

  return undefined;
}
