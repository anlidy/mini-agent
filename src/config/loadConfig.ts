import type { Config } from "./Config.js";

export function defaultConfig(workspace = process.cwd()): Config {
  return {
    workspace,
    provider: {},
    agent: {
      maxIterations: 10,
      maxToolResultChars: 64_000
    }
  };
}
