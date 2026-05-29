export interface AgentHookContext {
  iteration: number;
}

export class AgentHook {
  async beforeIteration(_context: AgentHookContext): Promise<void> {}
  async beforeExecuteTools(_context: AgentHookContext): Promise<void> {}
  async afterIteration(_context: AgentHookContext): Promise<void> {}
}
