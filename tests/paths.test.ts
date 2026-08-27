import path from "node:path";
import { describe, expect, it } from "vitest";
import { claudeConfigDir, claudeProjectDirs } from "../src/paths.js";

describe("path resolution", () => {
  it("honors CLAUDE_CONFIG_DIR for Claude Code roots", () => {
    const ctx = {
      platform: "darwin" as const,
      home: "/Users/ada",
      env: { CLAUDE_CONFIG_DIR: "/custom/claude" },
    };
    expect(claudeConfigDir(ctx)).toBe("/custom/claude");
    expect(claudeProjectDirs(ctx)).toEqual([
      path.join("/custom/claude", "projects"),
      path.join("/custom/claude", "transcripts"),
    ]);
  });

  it("defaults Claude Code roots under ~/.claude on every OS", () => {
    expect(
      claudeProjectDirs({
        platform: "win32",
        home: "C:\\Users\\ada",
        env: {},
      })[0],
    ).toBe(path.join("C:\\Users\\ada", ".claude", "projects"));
  });
});
