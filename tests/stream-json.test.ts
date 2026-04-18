import { describe, expect, it } from "vitest";
import { parseStreamJsonLine } from "../src/claude/stream-json.js";

describe("parseStreamJsonLine", () => {
  it("maps assistant text blocks to agent_message_chunk", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "text", text: "Hello" }],
      },
    });
    const r = parseStreamJsonLine("sess-1", line);
    expect(r?.updates.length).toBe(1);
    expect(r?.deltaText).toBe("Hello");
    expect(r?.isResult).toBe(false);
  });

  it("maps result line", () => {
    const line = JSON.stringify({
      type: "result",
      is_error: false,
    });
    const r = parseStreamJsonLine("sess-1", line);
    expect(r?.isResult).toBe(true);
    expect(r?.resultIsError).toBe(false);
  });

  it("maps stream_event text_delta", () => {
    const line = JSON.stringify({
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "x" } },
    });
    const r = parseStreamJsonLine("sess-1", line);
    expect(r?.deltaText).toBe("x");
  });
});
