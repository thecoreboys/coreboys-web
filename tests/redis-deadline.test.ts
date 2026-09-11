import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import * as nodeUtil from "node:util";
import * as nodeZlib from "node:zlib";
import { createClient } from "@redis/client";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

type Adapter = {
  redisGetJson(key: string): Promise<unknown>;
  redisSetJson(key: string, value: unknown, expirySeconds: number): Promise<boolean>;
};

function loadAdapter(url: string, clock: { offset: number }) {
  const javascript = transpileModule(readFileSync(resolve("lib/redis.ts"), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText;
  const adapterModule = { exports: {} };
  const clients: ReturnType<typeof createClient>[] = [];
  class TestDate extends Date { static override now() { return Date.now() + clock.offset; } }
  const context = vm.createContext({
    module: adapterModule, exports: adapterModule.exports, AbortSignal, setTimeout, clearTimeout,
    Date: TestDate, process: { env: { REDIS_URL: url } },
    require: (name: string) => {
      if (name === "server-only") return {};
      if (name === "node:buffer") return { Buffer };
      if (name === "node:util") return nodeUtil;
      if (name === "node:zlib") return nodeZlib;
      if (name === "@redis/client") return { createClient: (options: Parameters<typeof createClient>[0]) => {
        const client = createClient(options);
        clients.push(client);
        return client;
      } };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  new vm.Script(javascript, { filename: "redis.ts" }).runInContext(context);
  return { adapter: adapterModule.exports as Adapter, clients };
}

/** Minimal RESP command framing for a local fake Redis; no external service. */
function respond(socket: Socket, observe?: (args: string[]) => void) {
  let buffer = "";
  const values = new Map<string, string>();
  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    for (;;) {
      const header = /^\*(\d+)\r\n/.exec(buffer);
      if (!header) return;
      let position = header[0].length;
      const args: string[] = [];
      for (let i = 0; i < Number(header[1]); i++) {
        const bulk = /^\$(\d+)\r\n/.exec(buffer.slice(position));
        if (!bulk) return;
        const start = position + bulk[0].length;
        const end = start + Number(bulk[1]);
        if (buffer.length < end + 2) return;
        args.push(buffer.slice(start, end));
        position = end + 2;
      }
      buffer = buffer.slice(position);
      observe?.(args);
      if (args[0] === "SET") values.set(args[1]!, args[2]!);
      if (args[0] === "GET") {
        const value = values.get(args[1]!) ?? JSON.stringify({ cached: true });
        socket.write(`$${Buffer.byteLength(value)}\r\n${value}\r\n`);
      } else socket.write("+OK\r\n");
    }
  });
}

test("Redis bounds a silent handshake, shares backoff, destroys the socket and reconnects", { timeout: 6000 }, async () => {
  let healthy = false;
  const sockets = new Set<Socket>();
  let accepts = 0;
  const server = createServer((socket) => {
    accepts++;
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    if (healthy) respond(socket);
    else socket.on("data", () => {}); // Accept TCP but never complete Redis startup.
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const clock = { offset: 0 };
  const { adapter, clients } = loadAdapter(`redis://127.0.0.1:${address.port}`, clock);
  try {
    const started = Date.now();
    const results = await Promise.all(Array.from({ length: 6 }, () => adapter.redisGetJson("catalog")));
    assert.ok(results.every((value) => value === null));
    assert.ok(Date.now() - started < 2500, "cache lookups must not wait indefinitely for the Redis handshake");
    assert.equal(accepts, 1, "concurrent lookups must share one connection attempt");
    assert.equal(clients[0]!.isOpen, false, "timed-out connection must be destroyed");

    assert.equal(await adapter.redisGetJson("catalog"), null);
    assert.equal(clients.length, 1, "retry backoff must avoid another connection attempt");

    healthy = true;
    clock.offset += 15_001;
    assert.equal(JSON.stringify(await adapter.redisGetJson("catalog")), '{"cached":true}');
    assert.equal(clients.length, 2, "recovery must use a new client, not the abandoned handshake");
    assert.equal(accepts, 2);
  } finally {
    for (const client of clients) if (client.isOpen) client.destroy();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("oversized UTF-8 cache entries never reach Redis or disturb a healthy connection", async () => {
  const commands: string[][] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    respond(socket, (args) => commands.push(args));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const { adapter, clients } = loadAdapter(`redis://127.0.0.1:${address.port}`, { offset: 0 });
  try {
    assert.equal(await adapter.redisSetJson("small-before", { ok: true }, 60), true);
    // Below the character limit but above the byte limit after JSON encoding.
    assert.equal(await adapter.redisSetJson("oversized", "é".repeat(32 * 1024 * 1024), 60), false);
    assert.equal(await adapter.redisSetJson("small-after", { ok: true }, 60), true);
    assert.deepEqual(commands.filter(([verb]) => verb === "SET").map((args) => args[1]), ["small-before", "small-after"]);
    assert.equal(clients.length, 1, "skipping a large value must preserve the ready connection");
  } finally {
    for (const client of clients) if (client.isOpen) client.destroy();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("large public snapshots use compact Redis storage and round-trip without losing data", async () => {
  const commands: string[][] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    respond(socket, (args) => commands.push(args));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const { adapter, clients } = loadAdapter(`redis://127.0.0.1:${address.port}`, { offset: 0 });
  const value = { items: Array.from({ length: 2000 }, (_, i) => ({
    id: `video-${i}`, title: `Public video ${i}`, poster: `https://i.ytimg.com/vi/video-${i}/hqdefault.jpg`,
  })) };
  try {
    assert.equal(await adapter.redisSetJson("catalog", value, 60), true);
    const stored = commands.find(([verb]) => verb === "SET")?.[2];
    assert.ok(stored);
    assert.ok(Buffer.byteLength(stored) < Buffer.byteLength(JSON.stringify(value)) / 4);
    assert.equal(JSON.stringify(await adapter.redisGetJson("catalog")), JSON.stringify(value));
  } finally {
    for (const client of clients) if (client.isOpen) client.destroy();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
