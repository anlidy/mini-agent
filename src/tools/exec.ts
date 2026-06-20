import { spawn } from "node:child_process";

import type { Tool, ToolExecutionContext } from "./Tool.js";
import { truncate } from "./filesystem.js";

export interface ExecToolOptions {
  timeoutMs?: number;
  maxOutputChars?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_CHARS = 32_000;

/**
 * Patterns for obviously destructive commands. This is a safety net, not a
 * sandbox: the real isolation is cwd-pinning + the caller's approval gate.
 * Refusing these blocks the most catastrophic accidents (wiping the disk,
 * fork bombs, formatting devices, power state changes).
 */
const DENY_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+(-[a-z]*\s+)*(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b.*\s(\/|~|\$HOME)(\s|$)/i, reason: "recursive force-delete of a root/home path" },
  { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/, reason: "fork bomb" },
  { pattern: /\bmkfs(\.\w+)?\b/i, reason: "filesystem format" },
  { pattern: /\bdd\b[^\n]*\bof=\/dev\//i, reason: "raw write to a device" },
  { pattern: /\b(shutdown|reboot|halt|poweroff|init\s+0)\b/i, reason: "power state change" },
  { pattern: />\s*\/dev\/(sd|nvme|disk)/i, reason: "redirect to a block device" },
  { pattern: /\bchmod\s+-R\s+0?00\s+\//i, reason: "recursive permission wipe from root" }
];

export function createExecTool(options: ExecToolOptions = {}): Tool {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputChars = options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;

  return {
    name: "exec",
    description: "Run a shell command in the workspace directory. Use for builds, tests, and git. Avoid destructive commands; output is truncated.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", minLength: 1 },
        timeoutMs: { type: "integer", minimum: 1, maximum: 600_000 }
      },
      required: ["command"]
    },
    async execute(args, context) {
      const command = String(args.command);
      const denied = DENY_PATTERNS.find((entry) => entry.pattern.test(command));
      if (denied) {
        return `Error: refusing to run command (${denied.reason}). Adjust the command or run it manually.`;
      }
      if (context.approveCommand) {
        const approved = await context.approveCommand(command);
        if (!approved) {
          return "Error: command not approved by the caller.";
        }
      }
      const effectiveTimeout = clampTimeout(args.timeoutMs, timeoutMs);
      return runCommand(command, context, effectiveTimeout, maxOutputChars);
    }
  };
}

function clampTimeout(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.min(600_000, Math.floor(value));
  }
  return fallback;
}
// EXEC-MARKER

interface CommandOutcome {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
}

function runCommand(
  command: string,
  context: ToolExecutionContext,
  timeoutMs: number,
  maxOutputChars: number
): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: context.workspace,
      shell: true,
      detached: true,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const cap = maxOutputChars * 2;

    const timer = setTimeout(() => {
      timedOut = true;
      // Kill the whole process group (detached) so child pipelines die too.
      try {
        if (typeof child.pid === "number") {
          process.kill(-child.pid, "SIGKILL");
        } else {
          child.kill("SIGKILL");
        }
      } catch {
        child.kill("SIGKILL");
      }
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < cap) {
        stdout += chunk.toString();
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < cap) {
        stderr += chunk.toString();
      }
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve(`Error: failed to start command: ${error instanceof Error ? error.message : String(error)}`);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(formatOutcome(command, { stdout, stderr, code, timedOut }, timeoutMs, maxOutputChars));
    });
  });
}

function formatOutcome(command: string, outcome: CommandOutcome, timeoutMs: number, maxOutputChars: number): string {
  const sections: string[] = [];
  const combined = [outcome.stdout.trim(), outcome.stderr.trim()].filter(Boolean).join("\n");
  sections.push(combined.length > 0 ? combined : "(no output)");

  if (outcome.timedOut) {
    sections.push(`[command timed out after ${timeoutMs}ms and was killed]`);
  } else if (outcome.code !== 0 && outcome.code !== null) {
    sections.push(`[exit code ${outcome.code}]`);
  }
  return truncate(sections.join("\n"), maxOutputChars);
}
