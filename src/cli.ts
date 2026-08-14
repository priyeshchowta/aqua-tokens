#!/usr/bin/env node
const emit = process.emitWarning.bind(process);
process.emitWarning = ((warning: unknown, ...args: unknown[]) => {
  const text =
    typeof warning === "string"
      ? warning
      : warning instanceof Error
        ? warning.message
        : "";
  if (text.includes("SQLite is an experimental feature")) return;
  return (emit as (...a: unknown[]) => void)(warning, ...args);
}) as typeof process.emitWarning;

const { runCli } = await import("./main.js");
await runCli();
