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

/** Local aqua-tokens history. Per-machine by design. */
export function defaultStorePath(ctx: PathEnv = currentPathEnv()): string {
  return path.join(homeDir(ctx), ".aqua-tokens", "history.sqlite");
}

/** JSONL capture from the local OTLP POC receiver. Loopback only. */
export function defaultOtelPocPath(ctx: PathEnv = currentPathEnv()): string {
  return path.join(homeDir(ctx), ".aqua-tokens", "otel-poc.jsonl");
}
