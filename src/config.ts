/** Build-time defaults. Everything here can be overridden from the panel's Settings. */

/**
 * Fleetio proxy (AWS Lambda Function URL / API Gateway) — see proxy/README.md.
 * Leave empty to run on the bundled mock dataset. The user can paste a URL in
 * the panel's Settings; that value is stored via service.localStorage and wins.
 */
export const DEFAULT_PROXY_URL = "";

export const STORAGE_KEY = "gpsfms.shopPrices.settings.v1";
export const CACHE_KEY = "gpsfms.shopPrices.dataset.v1";
/** Re-use a cached dataset for this long before asking the proxy again. */
export const CACHE_TTL_MS = 30 * 60 * 1000;

export const DEFAULT_SETTINGS = {
  lookbackMonths: 12,
  nearbyRadiusMi: 25,
  task: "",
  compareTo: "nearby" as const,
  onlyInView: false,
  proxyUrl: DEFAULT_PROXY_URL,
};

/** Shops whose price differs from the comparison median by less than this are "average". */
export const BAND_TOLERANCE = 0.05;

/** Action-list event names must be globally unique across installed Map Add-Ins. */
export const EVT_NEAREST_FOR_DEVICE = "gpsfmsShopPrices.nearestForDevice";
export const EVT_NEAREST_HERE = "gpsfmsShopPrices.nearestHere";

export const BRAND = {
  navy: "#25477b",
  dark: "#1c2b39",
  blue: "#0084c2",
  blueSoft: "#e5f1f8",
  green: "#1b8a4c",
  amber: "#d98b00",
  red: "#c8352b",
  grey: "#7a8696",
};
