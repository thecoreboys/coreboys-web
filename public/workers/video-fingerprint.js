/* Content-only fingerprints; bounded memory even for multi-gigabyte videos. */
self.onmessage = async ({ data }) => {
  try {
    const file = data.file;
    if (!(file instanceof Blob) || !file.size || !crypto.subtle) throw new Error("unsupported");
    const chunkSize = 4 * 1024 * 1024;
    const prefix = new TextEncoder().encode(`COREVIDEO:sha256-chunks-v1-4mib:${file.size}:`);
    const root = new Uint8Array(prefix.length + Math.ceil(file.size / chunkSize) * 32);
    root.set(prefix);
    let index = prefix.length;
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const bytes = await file.slice(offset, offset + chunkSize).arrayBuffer();
      const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      root.set(hash, index);
      index += hash.length;
      self.postMessage({ type: "progress", percent: Math.round(Math.min(file.size, offset + chunkSize) / file.size * 100) });
    }
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", root));
    self.postMessage({ type: "complete", fingerprint: Array.from(hash, value => value.toString(16).padStart(2, "0")).join("") });
  } catch {
    self.postMessage({ type: "error" });
  }
};
