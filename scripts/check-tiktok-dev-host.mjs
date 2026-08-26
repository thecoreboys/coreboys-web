#!/usr/bin/env node

import { lookup } from "node:dns/promises";

const HOSTNAME = "127-0-0-1.sslip.io";
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1"]);

let addresses;
try {
  addresses = await lookup(HOSTNAME, { all: true, verbatim: true });
} catch (error) {
  console.error(
    `[tiktok-https] Refusing to start: ${HOSTNAME} could not be resolved.`,
  );
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const unexpected = addresses
  .map(({ address }) => address)
  .filter((address) => !LOOPBACK_ADDRESSES.has(address));

if (addresses.length === 0 || unexpected.length > 0) {
  console.error(
    `[tiktok-https] Refusing to start: ${HOSTNAME} must resolve only to loopback.`,
  );
  if (unexpected.length > 0) {
    console.error(`[tiktok-https] Unexpected address(es): ${unexpected.join(", ")}`);
  }
  process.exit(1);
}

console.log(
  `[tiktok-https] Verified ${HOSTNAME} resolves only to local loopback.`,
);
