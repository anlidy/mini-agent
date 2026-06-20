import { z } from "zod";

import type { Config } from "./Config.js";

/**
 * Thrown when `.mini-agent/config.json` fails schema validation. Carries the
 * underlying zod issues so callers can render a readable, path-qualified message.
 */
export class ConfigValidationError extends Error {
  constructor(message: string, readonly issues: z.core.$ZodIssue[]) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

const providerSchema = z
  .object({
    name: z.string().optional(),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    model: z.string().optional(),
    timeoutMs: z.number().int().positive().optional()
  })
  .strict();

const agentSchema = z
  .object({
    maxIterations: z.number().int().positive().default(10),
    maxToolResultChars: z.number().int().positive().default(64_000),
    contextWindowTokens: z.number().int().positive().optional()
  })
  .strict();

const sessionsSchema = z
  .object({
    dir: z.string(),
    defaultKey: z.string().default("default"),
    maxHistoryMessages: z.number().int().positive().default(50),
    maxHistoryChars: z.number().int().positive().default(200_000)
  })
  .strict();

const searchSchema = z
  .object({
    backend: z.enum(["duckduckgo", "none"]).default("none"),
    maxResults: z.number().int().positive().max(20).default(5)
  })
  .strict();

const execSchema = z
  .object({
    enabled: z.boolean().default(false),
    timeoutMs: z.number().int().positive().max(600_000).default(30_000),
    maxOutputChars: z.number().int().positive().default(32_000)
  })
  .strict();

function configSchema(workspace: string) {
  return z
    .object({
      workspace: z.string().default(workspace),
      provider: providerSchema.prefault({}),
      agent: agentSchema.prefault({}),
      sessions: sessionsSchema.prefault({ dir: defaultSessionsDir(workspace) }),
      search: searchSchema.optional(),
      exec: execSchema.optional()
    })
    .strict();
}

function defaultSessionsDir(workspace: string): string {
  return `${workspace}/.mini-agent/workspace/sessions`;
}

/**
 * Validate and normalize a raw config object, applying defaults for any omitted
 * fields. Throws {@link ConfigValidationError} with all issues on failure.
 */
export function parseConfig(raw: unknown, workspace: string): Config {
  const result = configSchema(workspace).safeParse(raw ?? {});
  if (!result.success) {
    throw new ConfigValidationError(
      `Invalid .mini-agent/config.json:\n${formatIssues(result.error.issues)}`,
      result.error.issues
    );
  }
  return result.data as Config;
}

/** Render a ConfigValidationError (or any error) as a readable string. */
export function formatConfigError(error: unknown): string {
  if (error instanceof ConfigValidationError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function formatIssues(issues: z.core.$ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `  - ${path}: ${issue.message}`;
    })
    .join("\n");
}
