import type { Tool, ToolExecutionContext } from "./Tool.js";
import { castJsonSchemaValue, validateJsonSchemaValue } from "./schema.js";

export interface PreparedToolCall {
  tool?: Tool;
  args: Record<string, unknown>;
  error?: string;
}

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private definitionsCache?: Array<Record<string, unknown>>;

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
    this.definitionsCache = undefined;
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getDefinitions(): Array<Record<string, unknown>> {
    if (this.definitionsCache) {
      return this.definitionsCache;
    }

    this.definitionsCache = [...this.tools.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      }));

    return this.definitionsCache;
  }

  prepareCall(name: string, args: Record<string, unknown>): PreparedToolCall {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        args,
        error: `Error: Tool '${name}' not found. Available: ${this.toolNames.join(", ")}`
      };
    }

    const castArgs = castJsonSchemaValue(args, tool.parameters) as Record<string, unknown>;
    const errors = validateJsonSchemaValue(castArgs, { ...tool.parameters, type: "object" });
    if (errors.length > 0) {
      return {
        tool,
        args: castArgs,
        error: `Error: Invalid parameters for tool '${name}': ${errors.join("; ")}`
      };
    }

    return { tool, args: castArgs };
  }

  async execute(name: string, args: Record<string, unknown>, context: ToolExecutionContext): Promise<unknown> {
    const prepared = this.prepareCall(name, args);
    if (prepared.error) {
      return prepared.error;
    }

    try {
      return await prepared.tool?.execute(prepared.args, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error executing ${name}: ${message}`;
    }
  }

  get toolNames(): string[] {
    return [...this.tools.keys()];
  }
}
