import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = dirname(require.resolve("react-native-webview/package.json"));
const source = readFileSync(join(root, "android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java"), "utf8");
if (!/shouldOverrideUrlLoading\(WebView view, WebResourceRequest request\)\s*\{\s*\/\/[^\n]*\n\s*if \(!request\.isForMainFrame\(\)\)\s*\{\s*return false;/.test(source)) {
  throw new Error("The required Android embedded-frame guard is missing. Install the locked patched WebView dependency.");
}
process.stdout.write("Android embedded-frame navigation guard verified.\n");
