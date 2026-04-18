#!/usr/bin/env node
/** Minimal stream-json lines for integration tests (no API). */
const lines = [
  {
    type: "system",
    subtype: "init",
    session_id: "00000000-0000-4000-8000-000000000000",
  },
  {
    type: "assistant",
    message: {
      content: [{ type: "text", text: "mock-ok" }],
    },
  },
  {
    type: "result",
    subtype: "success",
    is_error: false,
  },
];
for (const l of lines) {
  process.stdout.write(`${JSON.stringify(l)}\n`);
}
