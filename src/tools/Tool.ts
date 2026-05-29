export type JSONSchema = Record<string, unknown>;

export interface ToolExecutionContext {
  workspace: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  readOnly?: boolean;
  exclusive?: boolean;
  execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<unknown>;
}
