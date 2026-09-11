import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { createClient } from "@redis/client";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

type Adapter = { redisGetJson(key: string): Promise<unknown> };

function loadAdapter(url: string, clock: { offset: number }) {
  const javascript = transpileModule(readFileSync(resolve("lib/redis.ts"), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const clients: ReturnType<typeof createClient>[] = [];
  class TestDate extends Date { static override now() { return Date.now() + clock.offset; } }
  const context = vm.createContext({
    module, exports: module.exports, AbortSignal, setTimeout, clearTimeout,
    Date: TestDate, process: { env: { REDIS_URL: url } },
    require: (name: string) => {
      if (name === "server-only") return {};
      if (name === "@redis/client") return { createClient: (options: Parameters<typeof createClient>[0]) => {
        const client = createClient(options);
        clients.push(client);
        return client;
      } };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  new vm.Script(javascript, { filename: "redis.ts" }).runInContext(context);
  return { adapter: module.exports as Adapter, clients };
}

/** Minimal RESP command framing for a local fake Redis; no external service. */
function respond(socket: Socket) {
  let buffer = "";
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
      if (args[0] === "GET") {
        const value = JSON.stringify({ cached: true });
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
