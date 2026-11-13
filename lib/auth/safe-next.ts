/** Same-origin path check for post-auth redirects. Kept free of schema
 * libraries because the site-wide AuthModal imports it on every page. */
export function safeAuthNext(value: string | null | undefined, fallback = "/"): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !/[\\\u0000-\u001f\u007f]/.test(value)
    ? value : fallback;
}
