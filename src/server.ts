#!/usr/bin/env node
import { startServer } from "./server/index.js";

interface ServerArgs {
  workspace: string;
  host: string;
  port: number;
}

function parseArgs(argv: string[]): ServerArgs {
  const args: ServerArgs = {
    workspace: process.cwd(),
    host: "127.0.0.1",
    port: 3210
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--workspace" && argv[index + 1]) {
      args.workspace = argv[index + 1] ?? args.workspace;
      index += 1;
    } else if (item === "--host" && argv[index + 1]) {
      args.host = argv[index + 1] ?? args.host;
      index += 1;
    } else if (item === "--port" && argv[index + 1]) {
      args.port = Number(argv[index + 1]);
      index += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const app = await startServer(args);
process.stdout.write(`mini-agent server listening on ${app.url}\n`);
