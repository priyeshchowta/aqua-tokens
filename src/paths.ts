import os from "node:os";
import path from "node:path";

export interface PathEnv {
  platform: NodeJS.Platform;
  home: string;
  env: NodeJS.ProcessEnv;
}

export function currentPathEnv(): PathEnv {
  return { platform: process.platform, home: os.homedir(), env: process.env };
}

export function homeDir(ctx: PathEnv = currentPathEnv()): string {
  return ctx.home;
}

/** Claude Code config root. Honors CLAUDE_CONFIG_DIR; otherwise ~/.claude on every OS. */
export function claudeConfigDir(ctx: PathEnv = currentPathEnv()): string {
  const override = ctx.env.CLAUDE_CONFIG_DIR?.trim();
  if (override) return override;
  return path.join(homeDir(ctx), ".claude");
}

export function claudeProjectDirs(ctx: PathEnv = currentPathEnv()): string[] {
  const root = claudeConfigDir(ctx);
  return [path.join(root, "projects"), path.join(root, "transcripts")];
}

/**
 * Cursor user-data roots, resolved per OS.
 * macOS: ~/Library/Application Support/Cursor
 * Linux: $XDG_CONFIG_HOME/Cursor or ~/.config/Cursor (also lowercase)
 * Windows: %APPDATA%\Cursor
 */
export function cursorUserDataDirs(ctx: PathEnv = currentPathEnv()): string[] {
  const home = homeDir(ctx);
  const names = ["Cursor", "Cursor Nightly", "cursor"];
  const dirs: string[] = [];

  if (ctx.platform === "win32") {
    const appData = ctx.env.APPDATA?.trim() || path.join(home, "AppData", "Roaming");
    for (const name of names) dirs.push(path.join(appData, name));
    return dirs;
  }

  if (ctx.platform === "darwin") {
    const support = path.join(home, "Library", "Application Support");
    for (const name of names) dirs.push(path.join(support, name));
    return dirs;
  }

  const xdg = ctx.env.XDG_CONFIG_HOME?.trim() || path.join(home, ".config");
  for (const name of names) dirs.push(path.join(xdg, name));
  return dirs;
}

export function cursorStateDbCandidates(ctx: PathEnv = currentPathEnv()): string[] {
  return cursorUserDataDirs(ctx).map((root) =>
    path.join(root, "User", "globalStorage", "state.vscdb"),
  );
}

export function cursorAgentTranscriptDir(ctx: PathEnv = currentPathEnv()): string {
  return path.join(homeDir(ctx), ".cursor", "projects");
}

/** Local aqua-tokens history. Per-machine by design. */
export function defaultStorePath(ctx: PathEnv = currentPathEnv()): string {
  return path.join(homeDir(ctx), ".aqua-tokens", "history.sqlite");
}
