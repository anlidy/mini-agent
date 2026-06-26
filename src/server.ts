#!/usr/bin/env node
import { parseArgs } from "node:util";
import { startServer } from "./server/index.js";

interface ServerArgs {
  workspace: string;
  host: string;
  port: number;
}

function parseServerArgs(argv: string[]): ServerArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      workspace: { type: "string", default: process.cwd() },
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string", default: "3210" }
    },
    strict: true,
    allowPositionals: false
  });
  return {
    workspace: values.workspace ?? process.cwd(),
    host: values.host ?? "127.0.0.1",
    port: Number(values.port) || 3210
  };
}

const args = parseServerArgs(process.argv.slice(2));
const app = await startServer(args);
process.stdout.write(`mini-agent server listening on ${app.url}\n`);
