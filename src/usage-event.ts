import type { Platform, UsageEvent, UsageSource } from "./types.js";

export interface UsageEventInput {
  id: string;
  platform: Platform;
  sessionId: string;
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  source: UsageSource;
  sourceFile: string;
  requestId?: string;
  model?: string;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export function makeUsageEvent(input: UsageEventInput): UsageEvent {
  const event: UsageEvent = {
    id: input.id,
    platform: input.platform,
    sessionId: input.sessionId,
    timestamp: input.timestamp,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    cacheReadTokens: input.cacheReadTokens ?? 0,
    cacheCreationTokens: input.cacheCreationTokens ?? 0,
    source: input.source,
    sourceFile: input.sourceFile,
  };
  if (input.requestId) event.requestId = input.requestId;
  if (input.model) event.model = input.model;
  return event;
}
