/**
 * Google refuses to sign people in inside an app's embedded browser (LinkedIn, Facebook, Instagram and other
 * web views): the page shows "disallowed_useragent". Many visitors arrive from a LinkedIn post, so detect those
 * and offer the emailed code instead, which works anywhere.
 */
export function inAppBrowser(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  return /LinkedInApp|FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Twitter|; wv\)/i.test(ua);
}
