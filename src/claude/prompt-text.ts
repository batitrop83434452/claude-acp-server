import type { ContentBlock } from "@agentclientprotocol/sdk";

export function contentBlocksToPromptText(blocks: ContentBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "text") {
      parts.push(b.text);
    } else if (b.type === "resource_link") {
      parts.push(`[context: ${b.name}](${b.uri})`);
    } else if (b.type === "resource") {
      const r = b.resource;
      if ("text" in r && typeof r.text === "string") {
        parts.push(`--- file (${r.uri}) ---\n${r.text}\n---`);
      } else {
        parts.push(`[binary resource ${r.uri}]`);
      }
    } else if (b.type === "image") {
      parts.push("[image attachment omitted — not passed to Claude Code in this build]");
    } else if (b.type === "audio") {
      parts.push("[audio attachment omitted — not passed to Claude Code in this build]");
    }
  }
  return parts.join("\n\n");
}
