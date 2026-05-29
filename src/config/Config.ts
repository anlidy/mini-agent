export interface Config {
  workspace: string;
  provider: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
  agent: {
    maxIterations: number;
    maxToolResultChars: number;
  };
}
