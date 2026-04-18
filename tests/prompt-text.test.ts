import { describe, expect, it } from "vitest";
import { contentBlocksToPromptText } from "../src/claude/prompt-text.js";

describe("contentBlocksToPromptText", () => {
  it("joins text blocks", () => {
    const t = contentBlocksToPromptText([
      { type: "text", text: "a" },
      { type: "text", text: "b" },
    ]);
    expect(t).toBe("a\n\nb");
  });
});
