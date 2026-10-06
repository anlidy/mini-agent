export type JSONSchema = Record<string, unknown>;

export interface ToolExecutionContext {
  workspace: string;
  /**
   * Optional confirmation gate for side-effecting tools (e.g. exec). When
   * provided, the tool must await it and refuse if it resolves false. Lets the
   * caller (CLI prompt, Web UI dialog) own the approval UX. Absent ⇒ no extra
   * gate beyond the tool's own safety checks.
   */
  approveCommand?(command: string): Promise<boolean> | boolean;
  /** Fires when the user interrupts the turn; long-running tools should stop. */
  signal?: AbortSignal;
}

export interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  readOnly?: boolean;
  exclusive?: boolean;
  /** Old results may be summarized when the context budget is tight. */
  compactable?: boolean;
  execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<unknown>;
}
