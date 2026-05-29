import { describe, expect, it } from "vitest";

import type { Tool } from "../../src/tools/Tool.js";
import { ToolRegistry } from "../../src/tools/ToolRegistry.js";
import { castJsonSchemaValue, validateJsonSchemaValue } from "../../src/tools/schema.js";

function makeEchoTool(): Tool {
  return {
    name: "echo",
    description: "Echoes typed parameters.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", minLength: 1 },
        count: { type: "integer", minimum: 1, maximum: 5 },
        loud: { type: "boolean" },
        mode: { type: "string", enum: ["plain", "json"] }
      },
      required: ["text", "count"]
    },
    readOnly: true,
    async execute(args) {
      return `${args.text}:${args.count}:${args.loud === true ? "loud" : "quiet"}`;
    }
  };
}

describe("schema utilities", () => {
  it("casts common JSON schema scalar values before validation", () => {
    const schema = {
      type: "object",
      properties: {
        text: { type: "string" },
        count: { type: "integer" },
        enabled: { type: "boolean" },
        ratio: { type: "number" },
        tags: { type: "array", items: { type: "string" } }
      }
    };

    expect(castJsonSchemaValue({
      text: 123,
      count: "3",
      enabled: "true",
      ratio: "1.5",
      tags: [1, "two"]
    }, schema)).toEqual({
      text: "123",
      count: 3,
      enabled: true,
      ratio: 1.5,
      tags: ["1", "two"]
    });
  });

  it("reports nested required, enum, and range validation errors", () => {
    const errors = validateJsonSchemaValue(
      { count: 0, mode: "xml", nested: {} },
      {
        type: "object",
        properties: {
          text: { type: "string" },
          count: { type: "integer", minimum: 1 },
          mode: { type: "string", enum: ["plain", "json"] },
          nested: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"]
          }
        },
        required: ["text"]
      }
    );

    expect(errors).toEqual([
      "missing required text",
      "count must be >= 1",
      "mode must be one of plain, json",
      "missing required nested.name"
    ]);
  });
});

describe("ToolRegistry", () => {
  it("returns stable OpenAI-style tool definitions", () => {
    const registry = new ToolRegistry();
    registry.register({
      ...makeEchoTool(),
      name: "z_last"
    });
    registry.register(makeEchoTool());

    expect(registry.getDefinitions()).toEqual([
      {
        type: "function",
        function: {
          name: "echo",
          description: "Echoes typed parameters.",
          parameters: makeEchoTool().parameters
        }
      },
      {
        type: "function",
        function: {
          name: "z_last",
          description: "Echoes typed parameters.",
          parameters: makeEchoTool().parameters
        }
      }
    ]);
  });

  it("casts and validates parameters before executing a tool", async () => {
    const registry = new ToolRegistry();
    registry.register(makeEchoTool());

    await expect(registry.execute("echo", {
      text: "hello",
      count: "2",
      loud: "yes"
    }, { workspace: "/tmp/workspace" })).resolves.toBe("hello:2:loud");
  });

  it("returns model-readable errors for missing tools, invalid parameters, and exceptions", async () => {
    const registry = new ToolRegistry();
    registry.register(makeEchoTool());
    registry.register({
      name: "explode",
      description: "Throws.",
      parameters: { type: "object", properties: {} },
      async execute() {
        throw new Error("boom");
      }
    });

    await expect(registry.execute("missing", {}, { workspace: "/tmp/workspace" }))
      .resolves.toBe("Error: Tool 'missing' not found. Available: echo, explode");

    await expect(registry.execute("echo", { text: "", count: 9 }, { workspace: "/tmp/workspace" }))
      .resolves.toBe(
        "Error: Invalid parameters for tool 'echo': text must be at least 1 chars; count must be <= 5"
      );

    await expect(registry.execute("explode", {}, { workspace: "/tmp/workspace" }))
      .resolves.toBe("Error executing explode: boom");
  });
});
