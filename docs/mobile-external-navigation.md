# External navigation for React Native / Expo

The website and Expo starter share one policy: CORE pages stay in the app; other websites open through the phone's external URL handler. Content Rewards, source links, Guide/search/context-menu buttons, popup links and top-level redirects use this policy. Embedded player frames continue loading in place.

The Expo app source is in `native/expo`. `CoreSiteWebView.tsx` connects the shared policy to React Native's `Linking.openURL`, `onShouldStartLoadWithRequest` and `onOpenWindow`. It does not use an in-app browser sheet. The supported APIs are documented by [React Native Linking](https://reactnative.dev/docs/linking#openurl) and [React Native WebView](https://github.com/react-native-webview/react-native-webview/blob/v14.0.1/docs/Reference.md).

## Run and validate

Use Node 24 and pnpm 10:

```sh
cd native/expo
pnpm install --frozen-lockfile
pnpm typecheck
pnpm export:ios
pnpm start
```

The starter uses Expo SDK 58's compatible React, React Native, WebView, safe-area and Crypto versions. Node 24 is used by CI. `pnpm export:ios` checks the iOS JavaScript bundle; it is not a signed native build. Store signing, final icons and store metadata are separate work before submission.

## Navigation boundary

Only `https://thecoreboys.com` and `https://www.thecoreboys.com` are first-party production origins. Hostname prefixes, subdomains, credentials in URLs and nonstandard ports do not expand that boundary. The shared `nativeNavigationAction` returns:

| Result | Expo handler |
| --- | --- |
| `allow-in-app` | Keep the route in the current CORE WebView; first-party popup requests reuse it. |
| `open-system` | Cancel app navigation and call the OS URL handler. |
| `allow-embedded` | Let an embedded frame load its content. |
| `block` | Cancel an unsupported or malformed URL. |

The WebView's protocol whitelist is delegated to the strict callback because the library's built-in whitelist runs before that callback and cannot distinguish the player-frame exception. All top-level decisions still use exact parsed origins. Android's first source URL is fixed to CORE, since its first load does not trigger the navigation callback. Redirects and new-window events are handled at the native boundary before relying on page hydration.

### Android frame patch

WebView 14.0.1's Android client discards `WebResourceRequest.isForMainFrame` when forwarding a navigation to JavaScript. The committed pnpm patch lets subframes continue natively before dispatching the top-level app navigation callback. This keeps Twitch and YouTube player loads from being mistaken for app exits. Installation applies the locked patch, and the native typecheck verifies it is present.

Android verification requires a development/native build from this source: Expo Go's prebuilt Android WebView does not include the patch. The iOS JavaScript bundle export and unit tests do not compile the Android Java change.

## Website-to-native bridge

At document start, the Expo wrapper installs `window.CoreExternalBrowser` only into the trusted top-level CORE page. The script is repeated after loading as an Android fallback, without replacing pending requests. Website handlers read this bridge at click time, so late installation is supported.

Requests carry a cryptographically random per-WebView nonce, a bounded identifier and the destination URL. The native message handler checks the nonce, current document, message origin and URL again. It acknowledges only an accepted OS open; errors return to the website's retry message. Neither error path loads the external site in the app. URL values are not included in error messages or logs. Cross-origin embedded content does not receive the nonce.

Normal web visits use separate browser tabs and preserve existing billing redirect behavior. The global document listener also covers links inserted after navigation. Existing downloads and embedded resources are left to their own handlers.

## Before App Store submission

The actual signed package still needs an on-device run. Verify Content Rewards, other external links, redirects, popups, CORE routes, back navigation and player embeds. Provider connections also need a complete system-browser authentication return flow: Safari/browser cookies are separate from app WebView cookies, so starting OAuth inside one cookie jar and finishing in another is not a completed native account flow. Check that integration before treating the starter as a full app release.

Current checks exercise URL decisions, native dispatch, bridge acknowledgment/rejection, frame isolation and normal browser behavior. They do not claim that a physical iPhone or signed App Store package has been tested.
