import path from "node:path";
import { describe, expect, it } from "vitest";
import { claudeConfigDir, claudeProjectDirs, cursorStateDbCandidates, cursorUserDataDirs } from "../src/paths.js";

describe("cross-platform log paths", () => {
  it("uses ~/.claude on Unix-like systems and honors CLAUDE_CONFIG_DIR", () => {
    const unix = claudeProjectDirs({
      platform: "linux",
      home: "/home/ada",
      env: {},
    });
    expect(unix).toEqual(["/home/ada/.claude/projects", "/home/ada/.claude/transcripts"]);

    const override = claudeConfigDir({
      platform: "win32",
      home: "C:\\Users\\ada",
      env: { CLAUDE_CONFIG_DIR: "D:\\claude-config" },
    });
    expect(override).toBe("D:\\claude-config");
  });

  it("resolves Cursor user-data per OS instead of hardcoding a Unix path", () => {
    const mac = cursorUserDataDirs({
      platform: "darwin",
      home: "/Users/ada",
      env: {},
    });
    expect(mac[0]).toBe("/Users/ada/Library/Application Support/Cursor");

    const win = cursorStateDbCandidates({
      platform: "win32",
      home: "C:\\Users\\ada",
      env: { APPDATA: "C:\\Users\\ada\\AppData\\Roaming" },
    });
    expect(win[0]).toBe(
      path.join("C:\\Users\\ada\\AppData\\Roaming", "Cursor", "User", "globalStorage", "state.vscdb"),
    );

    const linux = cursorUserDataDirs({
      platform: "linux",
      home: "/home/ada",
      env: { XDG_CONFIG_HOME: "/home/ada/.config" },
    });
    expect(linux[0]).toBe("/home/ada/.config/Cursor");
  });
});
