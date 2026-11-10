import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, BackHandler, Linking, StyleSheet } from "react-native";
import * as Crypto from "expo-crypto";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { APP_SITE_ORIGINS, createNativeNavigationGuard, nativeNavigationAction } from "../../lib/navigation-policy";
import { isTrustedAppDocument, nativeExternalBridgeResult, nativeExternalBridgeScript, parseNativeBrowserRequest } from "../../lib/native-external-bridge";

const SITE = APP_SITE_ORIGINS[0];

export function CoreSiteWebView() {
  const webView = useRef<WebView<object>>(null);
  const documentUrl = useRef<string>(SITE);
  const canGoBack = useRef(false);
  const [uri, setUri] = useState<string>(SITE);
  const [nonce] = useState(() => Crypto.randomUUID());
  const bridgeScript = useMemo(() => nativeExternalBridgeScript(nonce), [nonce]);
  const recentOpen = useRef<{ url: string; time: number; promise: Promise<unknown> } | null>(null);

  function openSystemUrl(url: string): Promise<unknown> {
    const previous = recentOpen.current;
    if (previous?.url === url && Date.now() - previous.time < 1500) return previous.promise;
    const promise = Promise.resolve().then(() => Linking.openURL(url));
    recentOpen.current = { url, time: Date.now(), promise };
    return promise;
  }

  function reportOpenError() {
    Alert.alert("Could not open your browser", "Please try the link again.");
  }

  const guard = createNativeNavigationGuard(openSystemUrl, reportOpenError);

  function handleMessage(event: WebViewMessageEvent) {
    if (!isTrustedAppDocument(documentUrl.current)) return;
    const request = parseNativeBrowserRequest(event.nativeEvent.data, event.nativeEvent.url, nonce);
    if (!request) return;
    void openSystemUrl(request.url).then(
      () => webView.current?.injectJavaScript(nativeExternalBridgeResult(request.id, true)),
      () => webView.current?.injectJavaScript(nativeExternalBridgeResult(request.id, false)),
    );
  }

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack.current) return false;
      webView.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, []);

  return (
    <WebView<object>
      ref={webView}
      style={styles.webView}
      source={{ uri }}
      // The strict callback below owns top-level URL decisions. A protocol-only
      // WebView filter would preempt it, including for legitimate player frames.
      originWhitelist={["*"]}
      onShouldStartLoadWithRequest={(request) => guard({
        url: request.url,
        isMainFrame: request.isTopFrame !== false,
      })}
      onOpenWindow={({ nativeEvent }) => {
        const action = nativeNavigationAction(nativeEvent.targetUrl, { isNewWindow: true });
        if (action === "allow-in-app" && isTrustedAppDocument(nativeEvent.targetUrl)) setUri(nativeEvent.targetUrl);
        else if (action === "open-system") void openSystemUrl(nativeEvent.targetUrl).catch(reportOpenError);
      }}
      onMessage={handleMessage}
      injectedJavaScriptBeforeContentLoaded={bridgeScript}
      injectedJavaScriptBeforeContentLoadedForMainFrameOnly
      injectedJavaScript={bridgeScript}
      injectedJavaScriptForMainFrameOnly
      onLoadEnd={() => webView.current?.injectJavaScript(bridgeScript)}
      onNavigationStateChange={(state) => {
        if (isTrustedAppDocument(state.url)) {
          documentUrl.current = state.url;
          canGoBack.current = state.canGoBack;
          return;
        }
        // Restore CORE if a platform callback ever reports an unexpected escape.
        if (state.url !== "about:blank") {
          webView.current?.stopLoading();
          if (state.canGoBack) webView.current?.goBack();
          else setUri(SITE);
          guard({ url: state.url });
        }
      }}
      startInLoadingState
      allowsInlineMediaPlayback
      allowsFullscreenVideo
      allowsBackForwardNavigationGestures
      setSupportMultipleWindows
      javaScriptCanOpenWindowsAutomatically={false}
      mediaPlaybackRequiresUserAction={false}
    />
  );
}

const styles = StyleSheet.create({ webView: { flex: 1, backgroundColor: "#08080a" } });
