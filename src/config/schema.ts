import { z } from "zod";

import type { Config } from "./Config.js";

export class ConfigValidationError extends Error {
  constructor(message: string, readonly issues: z.core.$ZodIssue[]) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

const thinkingSchema = z
  .object({
    enabled: z.boolean().default(false),
    budgetTokens: z.number().int().positive().default(16_000)
  })
  .strict();

const agentConfigSchema = z
  .object({
    provider: z.string(),
    model: z.string(),
    thinking: thinkingSchema.prefault({}),
    effort: z.number().int().min(1).max(4).default(1),
    maxIterations: z.number().int().positive().default(100),
    maxToolResultChars: z.number().int().positive().default(64_000),
    contextWindowTokens: z.number().int().positive().optional(),
    params: z.record(z.string(), z.unknown()).default({})
  })
  .strict();

const providerConfigSchema = z
  .object({
    type: z.enum(["openai", "anthropic"]),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
    models: z.array(z.string()).optional()
  })
  .strict();

const sessionsSchema = z
  .object({
    dir: z.string(),
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

const toolsSchema = z
  .object({
    search: searchSchema.optional(),
    exec: execSchema.optional()
  })
  .strict();

function configSchema(configDir: string) {
  return z
    .object({
      agents: z.record(z.string(), agentConfigSchema).refine(
        (agents) => Object.keys(agents).length > 0,
        "At least one agent must be configured"
      ),
      providers: z.record(z.string(), providerConfigSchema).refine(
        (providers) => Object.keys(providers).length > 0,
        "At least one provider must be configured"
      ),
      sessions: sessionsSchema.prefault({ dir: `${configDir}/workspace/sessions` }),
      tools: toolsSchema.prefault({})
    })
    .strict();
}

/** Validate and normalize a raw config object. */
export function parseConfig(raw: unknown, configDir: string): Config {
  const result = configSchema(configDir).safeParse(raw ?? {});
  if (!result.success) {
    throw new ConfigValidationError(
      `Invalid .mini-agent/config.json:\n${formatIssues(result.error.issues)}`,
      result.error.issues
    );
  }
  return result.data as Config;
}

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
