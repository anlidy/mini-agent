import { createServer as createHttpServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Config } from "../config/Config.js";
import { ensureDefaultConfig } from "../config/loadConfig.js";
import type { LLMProvider } from "../providers/Provider.js";
import { SessionManager } from "../session/SessionManager.js";
import { HttpRouter } from "./httpRouter.js";
import { registerConfigRoutes, type ConfigState } from "./routes/config.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerToolRoutes } from "./routes/tools.js";
import { serveStatic } from "./static.js";
import { handleWebSocketUpgrade } from "./wsHandler.js";

export interface CreateServerOptions {
  workspace?: string;
  host?: string;
  port?: number;
  staticDir?: string;
  providerFactory?: (config: Config) => LLMProvider;
  approvalTimeoutMs?: number;
}

export interface MiniAgentServer {
  server: HttpServer;
  url: string;
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  listen(): Promise<void>;
  close(): Promise<void>;
}

export async function createServer(options: CreateServerOptions = {}): Promise<MiniAgentServer> {
  const handler = await createRequestHandler(options);
  const workspace = options.workspace ?? process.cwd();
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3210;
  const server = createHttpServer(handler.handle);

  server.on("upgrade", (req, socket, head) => {
    const handled = handleWebSocketUpgrade(req, socket, head, {
      workspace,
      state: handler.state,
      sessions: handler.sessions,
      providerFactory: options.providerFactory,
      approvalTimeoutMs: options.approvalTimeoutMs
    });
    if (!handled) {
      socket.destroy();
    }
  });

  const app: MiniAgentServer = {
    server,
    url: `http://${host}:${port}`,
    handle: handler.handle,
    async listen() {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = (): void => {
          server.off("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, host);
      });
      const address = server.address();
      if (address && typeof address === "object") {
        app.url = `http://${address.address}:${address.port}`;
      }
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  };
  return app;
}

export interface MiniAgentRequestHandler {
  state: ConfigState;
  sessions: SessionManager;
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
}

export async function createRequestHandler(options: CreateServerOptions = {}): Promise<MiniAgentRequestHandler> {
  const workspace = options.workspace ?? process.cwd();
  const staticDir = options.staticDir ?? defaultStaticDir();
  const state = createConfigState(await ensureDefaultConfig(workspace));
  const sessions = new SessionManager({ workspace, sessionsDir: state.config.sessions.dir });
  const router = new HttpRouter();

  registerSessionRoutes(router, sessions);
  registerConfigRoutes(router, state);
  registerToolRoutes(router, state);
  registerFileRoutes(router, workspace);

  return {
    state,
    sessions,
    async handle(req, res) {
      if (await router.handle(req, res)) {
        return;
      }
      await serveStatic(req, res, staticDir);
    }
  };
}

export async function startServer(options: CreateServerOptions = {}): Promise<MiniAgentServer> {
  const app = await createServer(options);
  await app.listen();
  return app;
}

function defaultStaticDir(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.basename(path.dirname(moduleDir)) === "src"
    ? path.resolve(moduleDir, "..", "..", "dist", "webui")
    : path.resolve(moduleDir, "..", "webui");
}

function createConfigState(initial: Config): ConfigState {
  return {
    config: initial,
    version: 0,
    update(config: Config) {
      this.config = config;
      this.version += 1;
    }
  };
}
