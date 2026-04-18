import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { applyServerWorkingDirectory, loadConfig } from "../src/config.js";

describe("loadConfig argv", () => {
  it("parses flags", () => {
    const c = loadConfig(["--mode", "ws", "--port", "9040", "--host", "127.0.0.1"]);
    expect(c.mode).toBe("ws");
    expect(c.port).toBe(9040);
    expect(c.host).toBe("127.0.0.1");
  });

  it("throws when a flag has no value", () => {
    expect(() => loadConfig(["--mode"])).toThrow(/Missing value/);
  });

  it("rejects invalid --mode", () => {
    expect(() => loadConfig(["--mode", "tcp"])).toThrow(/Invalid --mode/);
  });

  it("rejects invalid --port", () => {
    expect(() => loadConfig(["--port", "0"])).toThrow(/Invalid --port/);
    expect(() => loadConfig(["--port", "99999"])).toThrow(/Invalid --port/);
  });

  it("rejects invalid --log-level", () => {
    expect(() => loadConfig(["--log-level", "verbose"])).toThrow(
      /Invalid --log-level/,
    );
  });
});

describe("applyServerWorkingDirectory", () => {
  it("changes process cwd to an existing directory", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "acp-cwd-"));
    const before = process.cwd();
    applyServerWorkingDirectory(tmp);
    expect(process.cwd()).toBe(tmp);
    process.chdir(before);
  });

  it("throws for a non-existent path", () => {
    const bad = path.join(os.tmpdir(), `no-such-dir-${Date.now()}`);
    expect(() => applyServerWorkingDirectory(bad)).toThrow(/Cannot use working directory/);
  });
});
