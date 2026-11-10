import { APP_SITE_ORIGINS, navigationTarget } from "./navigation-policy";

export type NativeBrowserRequest = { id: string; url: string };
const SAFE_ID = /^[a-z0-9-]{1,64}$/;

export function isTrustedAppDocument(value: string): boolean {
  try {
    const url = new URL(value);
    return !url.username && !url.password && APP_SITE_ORIGINS.some((origin) => origin === url.origin);
  } catch { return false; }
}

export function parseNativeBrowserRequest(data: string, documentUrl: string, nonce: string): NativeBrowserRequest | null {
  if (!isTrustedAppDocument(documentUrl) || data.length > 8192) return null;
  try {
    const value: unknown = JSON.parse(data);
    if (!value || typeof value !== "object") return null;
    const message = value as Record<string, unknown>;
    if (message.type !== "core:open-external" || message.version !== 1 || message.nonce !== nonce
      || typeof message.id !== "string" || !SAFE_ID.test(message.id)
      || typeof message.url !== "string" || message.url.length > 4096) return null;
    const target = navigationTarget(message.url, APP_SITE_ORIGINS[0]);
    return target.kind === "external" || target.kind === "system" ? { id: message.id, url: target.url } : null;
  } catch { return null; }
}

/** Document-start script, also safe to repeat after Android finishes loading. */
export function nativeExternalBridgeScript(nonce: string): string {
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(nonce)) throw new Error("Invalid bridge nonce");
  return `(function () {
    if (window.top !== window || !${JSON.stringify(APP_SITE_ORIGINS)}.includes(window.location.origin)
      || !window.ReactNativeWebView || window.CoreExternalBrowser) return;
    var pending = new Map();
    var counter = 0;
    window.__CORE_EXTERNAL_BROWSER_RESULT__ = function (result) {
      var request = pending.get(result.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(result.id);
      if (result.ok) request.resolve();
      else request.reject(new Error('The browser could not be opened'));
    };
    window.CoreExternalBrowser = {
      version: 1,
      openExternalUrl: function (options) {
        return new Promise(function (resolve, reject) {
          var id = 'core-' + Date.now().toString(36) + '-' + (++counter).toString(36);
          var timer = setTimeout(function () {
            pending.delete(id);
            reject(new Error('The browser request timed out'));
          }, 30000);
          pending.set(id, { resolve: resolve, reject: reject, timer: timer });
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'core:open-external', version: 1, id: id,
              nonce: ${JSON.stringify(nonce)}, url: options.url
            }));
          } catch (error) {
            clearTimeout(timer); pending.delete(id); reject(error);
          }
        });
      }
    };
  })(); true;`;
}

export function nativeExternalBridgeResult(id: string, ok: boolean): string {
  if (!SAFE_ID.test(id)) return "true;";
  return `window.__CORE_EXTERNAL_BROWSER_RESULT__ && window.__CORE_EXTERNAL_BROWSER_RESULT__(${JSON.stringify({ id, ok })}); true;`;
}
