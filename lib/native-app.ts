export type NativeAppRuntime = {
  ReactNativeWebView?: { postMessage?: unknown };
  CoreExternalBrowser?: { version?: unknown; openExternalUrl?: unknown };
};

/** Use the installed app's bridge, so ordinary mobile browsers keep web tools. */
export function isNativeAppRuntime(runtime: NativeAppRuntime): boolean {
  return typeof runtime.ReactNativeWebView?.postMessage === "function"
    || (runtime.CoreExternalBrowser?.version === 1
      && typeof runtime.CoreExternalBrowser.openExternalUrl === "function");
}
